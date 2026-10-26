<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import type { Person, Relation } from '../types';

/**
 * The family-tree viewport: where the graph is drawn and moved.
 *
 * Positions are computed here from the generations and the relation
 * records — one band per generation, oldest at the top, couples kept side
 * by side, children centred under their parents — and every line is drawn
 * from an actual relation. Nothing is decorated to imitate the reference
 * picture: a card is only connected to another card if the data says so.
 *
 * Pan, zoom and fit act on this viewport and nothing else, so the page
 * around it never has to know the tree is scrollable. That separation is
 * the point: the layout of the screen is `TreeViewView`'s business, the
 * layout of the graph is this component's.
 *
 * No graph library, deliberately. There was none to reuse — the canvas
 * used to be CSS columns with arrows between them — and a transform plus
 * one SVG layer covers every interaction the screen needs. Adding a
 * dependency for it would be a dependency the milestone does not ask for.
 *
 * Zoom, pan and the selected person are all *ways of looking at one tree*,
 * not facts about it: this state dies with the component (m1-explain.md).
 */
const props = defineProps<{
  /** Oldest generation first — from `useTreeStore().generations`. */
  generations: Array<{ generation: number; people: Person[] }>;
  /** The relations those positions and lines are drawn from. */
  relations: Relation[];
  /** The person selected in the URL (`?person=…`), if any. */
  selectedId: string;
}>();

const emit = defineEmits<{
  /** Ask the page to put `?person=…` in the URL — never sets it itself. */
  select: [personId: string];
  /** The zoom percentage for the toolbar to show. */
  'zoom-change': [percent: number];
}>();

/* ---- the constants every position is measured in ------------------- */

const CARD_W = 140;
const CARD_H = 132;
const COL_GAP = 20;
const ROW_GAP = 68;
/** Room above each band for its generation label. */
const LABEL_H = 26;
const PAD = 28;

const MIN_SCALE = 0.25;
const MAX_SCALE = 2;
/**
 * A fitted tree can be unreadably small on a phone (the seed's graph is
 * ~1300px wide). The page opens at this floor and lets the reader pan,
 * rather than shrinking names past the point of being names; the Fit
 * button still goes all the way out.
 */
const FIT_FLOOR = 0.7;
const DRAG_THRESHOLD = 4;

interface Position {
  x: number;
  y: number;
}

interface Node {
  person: Person;
  x: number;
  y: number;
}

interface Band {
  generation: number;
  nodes: Node[];
  labelY: number;
}

interface Edge {
  d: string;
  kind: 'parent' | 'spouse' | 'sibling';
}

interface Layout {
  width: number;
  height: number;
  bands: Band[];
  edges: Edge[];
  placed: Map<string, Position>;
}

/* ---- what the relations say ---------------------------------------- */

/** child id → parent ids, for both the layout and the sibling test. */
const parentsByChild = computed(() => {
  const index = new Map<string, string[]>();
  for (const relation of props.relations) {
    if (relation.type !== 'PARENT') continue;
    const list = index.get(relation.toId);
    if (list) list.push(relation.fromId);
    else index.set(relation.toId, [relation.fromId]);
  }
  return index;
});

/** Everyone who has at least one relation — the "not linked yet" flag. */
const linkedIds = computed(() => {
  const ids = new Set<string>();
  for (const relation of props.relations) {
    ids.add(relation.fromId);
    ids.add(relation.toId);
  }
  return ids;
});

/**
 * Siblings are only worth drawing when they say something the parent lines
 * do not already say — two people with a shared parent are visibly
 * siblings from the parents' lines alone, and a second line between them
 * is noise.
 */
function sharesAParent(a: string, b: string): boolean {
  const first = parentsByChild.value.get(a) ?? [];
  const second = parentsByChild.value.get(b) ?? [];
  return first.some((id) => second.includes(id));
}

/**
 * Couples, as contiguous runs inside one band.
 *
 * Spouses are grouped with a union-find over the SPOUSE relations so that
 * a couple always occupies neighbouring cards: that makes the spouse line
 * a short bridge across the gap rather than a line drawn across whoever
 * happens to sit between them.
 */
function coupleGroups(people: Person[]): Person[][] {
  const index = new Map(people.map((person) => [person.id, person.id]));
  const root = new Map(people.map((person) => [person.id, person.id]));

  const find = (id: string): string => {
    let cursor = id;
    let parent = root.get(cursor);
    while (parent !== undefined && parent !== cursor) {
      cursor = parent;
      parent = root.get(cursor);
    }
    return cursor;
  };

  for (const relation of props.relations) {
    if (relation.type !== 'SPOUSE') continue;
    if (!index.has(relation.fromId) || !index.has(relation.toId)) continue;
    const a = find(relation.fromId);
    const b = find(relation.toId);
    if (a !== b) root.set(a, b);
  }

  const buckets = new Map<string, Person[]>();
  for (const person of people) {
    const key = find(person.id);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(person);
    else buckets.set(key, [person]);
  }
  return [...buckets.values()];
}

/* ---- the layout ----------------------------------------------------- */

const layout = computed<Layout>(() => {
  const placed = new Map<string, Position>();
  const edges: Edge[] = [];

  /* Pass 1 — order each band and measure it. A group's key is the middle
     of its parents, so children land under the couple they belong to; a
     group with no recorded parents sorts last, in its original order. */
  const bandsToPlace = props.generations.map((band) => {
    const keyed = coupleGroups(band.people).map((group, index) => {
      const centres: number[] = [];
      for (const person of group) {
        for (const parentId of parentsByChild.value.get(person.id) ?? []) {
          const at = placed.get(parentId);
          if (at) centres.push(at.x + CARD_W / 2);
        }
      }
      const middle =
        centres.length === 0
          ? Number.POSITIVE_INFINITY
          : centres.reduce((sum, x) => sum + x, 0) / centres.length;
      return { group, middle, index };
    });
    keyed.sort((a, b) => a.middle - b.middle || a.index - b.index);

    const width =
      band.people.length * CARD_W + Math.max(0, band.people.length - 1) * COL_GAP;
    return {
      generation: band.generation,
      groups: keyed.map((entry) => entry.group),
      width,
    };
  });

  let width = PAD * 2;
  for (const band of bandsToPlace) width = Math.max(width, band.width + PAD * 2);

  /* Pass 2 — place them, centred band by band, and collect the lines. */
  const bands: Band[] = [];
  let height = PAD;

  bandsToPlace.forEach((band, rowIndex) => {
    const y = PAD + LABEL_H + rowIndex * (CARD_H + ROW_GAP);
    let cursor = (width - band.width) / 2;
    const nodes: Node[] = [];

    for (const group of band.groups) {
      const members: Node[] = [];
      for (const person of group) {
        const node = { person, x: cursor, y };
        nodes.push(node);
        members.push(node);
        placed.set(person.id, { x: cursor, y });
        cursor += CARD_W + COL_GAP;
      }
      /* The couple's own line: a short bridge across the gap between
         neighbouring cards, at their middle height. */
      for (let i = 0; i + 1 < members.length; i += 1) {
        const left = members[i];
        const right = members[i + 1];
        if (!left || !right) continue;
        edges.push({
          kind: 'spouse',
          d: `M${left.x + CARD_W} ${left.y + CARD_H / 2}H${right.x}`,
        });
      }
    }

    bands.push({
      generation: band.generation,
      nodes,
      labelY: y - LABEL_H,
    });
    height = y + CARD_H + PAD;
  });

  /* Pass 3 — the lines that depend on where everybody ended up. */
  for (const relation of props.relations) {
    const from = placed.get(relation.fromId);
    const to = placed.get(relation.toId);
    if (!from || !to) continue;

    if (relation.type === 'PARENT') {
      const x1 = from.x + CARD_W / 2;
      const y1 = from.y + CARD_H;
      const x2 = to.x + CARD_W / 2;
      const y2 = to.y;
      const middle = y1 + (y2 - y1) / 2;
      edges.push({
        kind: 'parent',
        d:
          x1 === x2
            ? `M${x1} ${y1}V${y2}`
            : `M${x1} ${y1}V${middle}H${x2}V${y2}`,
      });
      continue;
    }

    /* A sibling link with no shared parent — the case the parents' lines
       cannot show. Drawn dashed so it never reads as parenthood. */
    if (
      relation.type === 'SIBLING' &&
      !sharesAParent(relation.fromId, relation.toId)
    ) {
      if (from.y === to.y) {
        const left = from.x < to.x ? from : to;
        const right = from.x < to.x ? to : from;
        const y = from.y + CARD_H / 2;
        edges.push({
          kind: 'sibling',
          d: `M${left.x + CARD_W} ${y}H${right.x}`,
        });
      } else {
        const x1 = from.x + CARD_W / 2;
        const x2 = to.x + CARD_W / 2;
        const y1 = from.y + CARD_H / 2;
        const y2 = to.y + CARD_H / 2;
        const middle = (from.y + to.y) / 2 + CARD_H / 2;
        edges.push({
          kind: 'sibling',
          d: `M${x1} ${y1}V${middle}H${x2}V${y2}`,
        });
      }
    }

    /* FRIEND is deliberately not drawn: a friendship is not a family tie,
       and a line across the graph would read as one. The person page
       lists friends, which is where a reader looks for them. */
  }

  return { width, height, bands, edges, placed };
});

/* ---- moving around -------------------------------------------------- */

const viewport = ref<HTMLDivElement | null>(null);
const scale = ref(1);

/**
 * When the last drag ended, so the click it ends on does not also select
 * whatever the pointer happened to be over.
 *
 * A timestamp rather than a latch: a latch left standing swallows the next
 * click whatever it is — including Enter on a focused card, which never
 * went near a pointerdown.
 */
let dragEndedAt = 0;
const CLICK_AFTER_DRAG = 300;

function clamp(value: number, low = MIN_SCALE, high = MAX_SCALE): number {
  return Math.min(Math.max(value, low), high);
}

function reportZoom(): void {
  emit('zoom-change', Math.round(scale.value * 100));
}

function setScale(next: number): void {
  scale.value = clamp(next);
  reportZoom();
}

const sceneStyle = computed(() => ({
  width: `${layout.value.width * scale.value}px`,
  height: `${layout.value.height * scale.value}px`,
}));

const innerStyle = computed(() => ({
  width: `${layout.value.width}px`,
  height: `${layout.value.height}px`,
  transform: `scale(${scale.value})`,
}));

/** Zoom about the middle of what is currently showing. */
function zoomBy(factor: number): void {
  const box = viewport.value;
  if (!box) return;

  const centreX = box.scrollLeft + box.clientWidth / 2;
  const centreY = box.scrollTop + box.clientHeight / 2;
  const next = clamp(scale.value * factor);
  const ratio = next / scale.value;
  setScale(next);

  void nextTick(() => {
    box.scrollLeft = centreX * ratio - box.clientWidth / 2;
    box.scrollTop = centreY * ratio - box.clientHeight / 2;
  });
}

function fitScale(): number {
  const box = viewport.value;
  if (!box || layout.value.width === 0 || layout.value.height === 0) return 1;
  return clamp(
    Math.min(box.clientWidth / layout.value.width, box.clientHeight / layout.value.height),
    MIN_SCALE,
    1,
  );
}

/** Fit the whole graph inside the viewport, centred. */
function fit(): void {
  const box = viewport.value;
  if (!box) return;
  setScale(fitScale());
  void nextTick(() => {
    box.scrollLeft = Math.max(
      0,
      (layout.value.width * scale.value - box.clientWidth) / 2,
    );
    box.scrollTop = Math.max(
      0,
      (layout.value.height * scale.value - box.clientHeight) / 2,
    );
  });
}

/** Bring one person to the middle — used for a link into `?person=…`. */
function centreOn(personId: string): void {
  const box = viewport.value;
  const at = layout.value.placed.get(personId);
  if (!box || !at) return;
  void nextTick(() => {
    box.scrollLeft = Math.max(
      0,
      (at.x + CARD_W / 2) * scale.value - box.clientWidth / 2,
    );
    box.scrollTop = Math.max(
      0,
      (at.y + CARD_H / 2) * scale.value - box.clientHeight / 2,
    );
  });
}

onMounted(() => {
  /* Open fitted — but never below the floor at which names stop being
     readable; past that the tree is panned instead of squinted at. */
  const opening = Math.max(fitScale(), FIT_FLOOR);
  setScale(opening);

  void nextTick(() => {
    const box = viewport.value;
    if (box) {
      /* A tree wider than its viewport opens centred on the family rather
         than showing whatever happens to be at the left edge — the oldest
         generation is usually somewhere in the middle of the graph. */
      box.scrollLeft = Math.max(
        0,
        (layout.value.width * opening - box.clientWidth) / 2,
      );
      box.scrollTop = 0;
    }
    if (props.selectedId !== '') centreOn(props.selectedId);
  });
});

/**
 * Drag to pan (mouse and pen; touch scrolls the viewport natively, so the
 * page can still be scrolled from over the canvas on a phone).
 */
function startPan(event: PointerEvent): void {
  if (event.pointerType === 'touch' || event.button !== 0) return;

  const box = viewport.value;
  if (!box) return;

  const startX = event.clientX;
  const startY = event.clientY;
  const startLeft = box.scrollLeft;
  const startTop = box.scrollTop;
  let moved = false;

  const onMove = (move: PointerEvent): void => {
    const dx = move.clientX - startX;
    const dy = move.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    moved = true;
    box.classList.add('is-panning');
    box.scrollLeft = startLeft - dx;
    box.scrollTop = startTop - dy;
  };

  const onUp = (): void => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    box.classList.remove('is-panning');
    if (moved) dragEndedAt = Date.now();
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function onCardClick(personId: string): void {
  if (dragEndedAt !== 0) {
    const partOfTheDrag = Date.now() - dragEndedAt < CLICK_AFTER_DRAG;
    dragEndedAt = 0;
    if (partOfTheDrag) return;
  }
  emit('select', personId);
}

defineExpose({ zoomBy, fit, centreOn });

/* ---- the card's own text -------------------------------------------- */

function yearOf(date: string | null): string {
  return date === null ? '' : date.slice(0, 4);
}

function lifespan(person: Person): string {
  const born = yearOf(person.birthDate);
  const died = yearOf(person.deathDate);
  if (born === '' && died === '') return '';
  /* Tight, like the reference's "1938–2012" — a card has no room for
     padding around a dash, and a lone year still reads as a year. */
  return `${born || '?'}–${died}`.trim();
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter((part) => part.length > 0);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}
</script>

<template>
  <div
    ref="viewport"
    class="viewport"
    aria-label="Family tree canvas"
    @pointerdown="startPan"
  >
    <div
      class="viewport__scene"
      :style="sceneStyle"
    >
      <div
        class="viewport__inner"
        :style="innerStyle"
      >
        <!-- Every line here came from a relation record. -->
        <svg
          class="edges"
          :width="layout.width"
          :height="layout.height"
          :viewBox="`0 0 ${layout.width} ${layout.height}`"
          aria-hidden="true"
        >
          <path
            v-for="(edge, index) in layout.edges"
            :key="index"
            class="edges__line"
            :class="`edges__line--${edge.kind}`"
            :d="edge.d"
          />
        </svg>

        <template
          v-for="band in layout.bands"
          :key="band.generation"
        >
          <h2
            class="column__title"
            :style="{ top: `${band.labelY}px` }"
          >
            Generation {{ band.generation + 1 }}
          </h2>

          <button
            v-for="node in band.nodes"
            :key="node.person.id"
            type="button"
            class="card"
            :class="{ 'card--selected': node.person.id === selectedId }"
            :style="{ left: `${node.x}px`, top: `${node.y}px` }"
            :aria-pressed="node.person.id === selectedId ? 'true' : 'false'"
            @click="onCardClick(node.person.id)"
          >
            <span
              class="card__avatar"
              aria-hidden="true"
            >
              <img
                v-if="node.person.photoUrl"
                :src="node.person.photoUrl"
                alt=""
              />
              <span v-else>{{ initials(node.person.fullName) }}</span>
            </span>
            <span class="card__name">{{ node.person.fullName }}</span>
            <span class="card__dates">{{ lifespan(node.person) }}</span>
            <span
              v-if="!linkedIds.has(node.person.id)"
              class="card__flag"
            >
              not linked yet
            </span>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The viewport scrolls; the scene is the part that scales. Two elements
   rather than one because a transform does not change layout size — the
   wrapper carries the scaled size so the scrollbars, the fit calculation
   and the drag all agree on how big the tree is. */
.viewport {
  height: clamp(460px, 72vh, 780px);
  overflow: auto;
  background: var(--surface);
  cursor: grab;
  touch-action: pan-y;
  scrollbar-width: thin;
  scrollbar-color: var(--sand) transparent;
}

.viewport.is-panning {
  cursor: grabbing;
  user-select: none;
}

.viewport__scene {
  position: relative;
}

.viewport__inner {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}

/* ---- relationship lines --------------------------------------------- */

.edges {
  position: absolute;
  inset: 0;
}

.edges__line {
  fill: none;
  stroke: var(--connector);
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* A couple's own link, drawn a shade warmer where it helps. */
.edges__line--spouse {
  stroke: var(--primary);
  stroke-opacity: 0.55;
}

/* Says "related", not "parent of". */
.edges__line--sibling {
  stroke-dasharray: 5 4;
}

/* ---- one generation -------------------------------------------------- */

.column__title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  padding: 0 0.55rem;
  border-radius: 999px;
  /* Sits over the lines so they stop at the label instead of running
     through it. */
  background: var(--surface);
  font-size: 0.78rem;
  font-weight: 600;
  font-variant: small-caps;
  letter-spacing: 0.1em;
  color: var(--text-muted);
}

/* ---- a person card --------------------------------------------------- */

.card {
  position: absolute;
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 0.15rem;
  width: 140px;
  height: 132px;
  padding: 0.65rem;
  overflow: hidden;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
  font: inherit;
  color: var(--text);
  text-align: center;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.card:hover {
  border-color: var(--primary);
}

.card:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

/* Selected: the terracotta wash and ring, exactly as the reference screen
   draws it — a wash of colour, not a shadow. No other card is tinted. */
.card--selected {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.card--selected .card__avatar {
  background: var(--surface);
}

.card__avatar {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  margin-bottom: 0.3rem;
  overflow: hidden;
  border-radius: 50%;
  background: var(--sand);
  color: var(--text);
  font-size: 0.78rem;
  font-weight: 700;
}

.card__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card__name {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.card__dates {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.card__flag {
  font-size: 0.68rem;
  font-style: italic;
  color: var(--danger);
}
</style>
