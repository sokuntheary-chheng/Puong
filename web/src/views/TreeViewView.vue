<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AsyncState from '../components/AsyncState.vue';
import { useStringParam, useStringQuery } from '../composables/useRouteString';
import { useMemoriesStore } from '../stores/memories';
import { useSessionStore } from '../stores/session';
import { useTreeStore } from '../stores/tree';
import type { Person } from '../mock/types';

/**
 * /trees/:treeId — the family-tree canvas.
 *
 * This is the M1 checklist's detail page with a route parameter.
 *
 * Three things are read from the URL rather than from the store:
 *
 *   :treeId   which tree is open — required for the page to render at all;
 *   ?person=  which person is selected — so a link to one person can be
 *             shared, and a refresh does not lose the selection.
 *
 * Selecting a person is therefore a route push, not a store commit: the two
 * must not be able to disagree.
 *
 * The two tabs are *not* route state — they are a way of looking at one
 * tree, not a fact about it (docs/m1-explain.md), so they live here and die
 * with the page.
 */
const store = useTreeStore();
const memories = useMemoriesStore();
const session = useSessionStore();
const router = useRouter();

const treeId = useStringParam('treeId');
const selectedPersonId = useStringQuery('person');

/** Which of the two panels is showing. Defaults to the tree. */
const tab = ref<'tree' | 'memories'>('tree');

function showTab(next: 'tree' | 'memories'): void {
  tab.value = next;
}

onMounted(() => {
  void store.open(treeId.value);
  void memories.fetchForTree(treeId.value);
});

/* Changing tree in place must reload — without this, navigating from one
   tree straight to another would keep showing the first one's people. */
watch(treeId, (next) => {
  if (next !== store.loadedTreeId) void store.open(next);
  void memories.fetchForTree(next);
});

/* FR-6.6 — whether a private memory is counted depends on who is asking,
   so switching identity has to recount (the person page does the same). */
watch(
  () => session.currentUserId,
  () => {
    void memories.fetchForTree(treeId.value);
  },
);

const isEmpty = computed(() => store.people.data.length === 0);

/* ------------------------------------------------------------------ */
/* The three counts across the top                                     */
/* ------------------------------------------------------------------ */

/** The tree requests have four states; a count is only honest once one of
 *  them has finished. Until then the card shows a dash rather than a 0
 *  that looks like a real answer. */
const peopleReady = computed(() => store.loadState.status === 'ready');
const memoriesReady = computed(() => memories.list.status === 'ready');

const peopleCount = computed(() => store.people.data.length);
const generationCount = computed(() => store.generations.length);
const memoryCount = computed(() => memories.list.data.length);
const noMemories = computed(() => memories.list.data.length === 0);

function statValue(ready: boolean, count: number): string {
  return ready ? String(count) : '–';
}

/* ------------------------------------------------------------------ */
/* The tree                                                            */
/* ------------------------------------------------------------------ */

/** People with no relation to anyone — story 4 creates them, story 5 links them. */
const unlinkedIds = computed(() => {
  const linked = new Set<string>();
  for (const relation of store.relations.data) {
    linked.add(relation.fromId);
    linked.add(relation.toId);
  }
  return linked;
});

const selectedPerson = computed(() =>
  selectedPersonId.value === '' ? null : store.find(selectedPersonId.value),
);

const selectedFamily = computed(() =>
  selectedPerson.value ? store.familyOf(selectedPerson.value.id) : [],
);

/**
 * Who the header's primary button writes a memory about.
 *
 * M1's only write action reachable from this screen is "add a memory", and
 * it needs a person (FR-6.2). With nobody selected it falls back to the
 * first person in the tree, so the button is never a dead end; a viewer is
 * not offered it at all (FR-3.6).
 */
const memoryTarget = computed<Person | null>(
  () => selectedPerson.value ?? store.people.data[0] ?? null,
);

function select(personId: string): void {
  void router.push({
    name: 'tree',
    params: { treeId: treeId.value },
    query: personId === selectedPersonId.value ? {} : { person: personId },
  });
}

function yearOf(date: string | null): string {
  return date === null ? '' : date.slice(0, 4);
}

function lifespan(person: { birthDate: string | null; deathDate: string | null }): string {
  const born = yearOf(person.birthDate);
  const died = yearOf(person.deathDate);
  if (born === '' && died === '') return '';
  /* Tight, like the reference's "1938–2012" — a card has no room for
     padding around a dash, and a lone year still reads as a year. */
  return `${born || '?'}–${died || ''}`.trim();
}

/** The two initials a card wears in its avatar circle. */
function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter((part) => part.length > 0);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

function personName(personId: string): string {
  return store.find(personId)?.fullName ?? personId;
}
</script>

<template>
  <section>
    <p class="crumb">
      <RouterLink to="/">
        My trees
      </RouterLink>
      / {{ store.tree.data?.name ?? treeId }}
    </p>

    <header class="head">
      <div class="head__text">
        <h1>{{ store.tree.data?.name ?? 'Family tree' }}</h1>
        <p
          v-if="store.tree.data?.description"
          class="head__desc"
        >
          {{ store.tree.data.description }}
        </p>
        <p
          v-if="store.myRole"
          class="role"
        >
          You are <strong>{{ store.myRole.toLowerCase() }}</strong> here
          <span
            v-if="!store.canWrite"
            class="role__note"
          >— you can read, not write</span>
        </p>
      </div>

      <RouterLink
        v-if="store.canWrite && memoryTarget"
        class="head__action"
        :to="{
          name: 'memory-new',
          params: { treeId, personId: memoryTarget.id },
        }"
      >
        Add a memory
      </RouterLink>
    </header>

    <dl class="stats">
      <div class="stat">
        <dt class="stat__label">
          Family members
        </dt>
        <dd class="stat__value">
          {{ statValue(peopleReady, peopleCount) }}
        </dd>
      </div>
      <div class="stat">
        <dt class="stat__label">
          Generations
        </dt>
        <dd class="stat__value">
          {{ statValue(peopleReady, generationCount) }}
        </dd>
      </div>
      <div class="stat">
        <dt class="stat__label">
          Memories
        </dt>
        <dd class="stat__value">
          {{ statValue(memoriesReady, memoryCount) }}
        </dd>
      </div>
    </dl>

    <div class="board">
      <div
        class="board__tabs"
        role="tablist"
        aria-label="How to look at this tree"
      >
        <button
          id="tab-tree"
          type="button"
          role="tab"
          class="board__tab"
          :class="{ 'board__tab--on': tab === 'tree' }"
          :aria-selected="tab === 'tree'"
          aria-controls="tree-panel"
          @click="showTab('tree')"
        >
          Family tree
        </button>
        <button
          id="tab-memories"
          type="button"
          role="tab"
          class="board__tab"
          :class="{ 'board__tab--on': tab === 'memories' }"
          :aria-selected="tab === 'memories'"
          aria-controls="tree-panel"
          @click="showTab('memories')"
        >
          Memories
        </button>
      </div>

      <div
        id="tree-panel"
        role="tabpanel"
        class="board__body"
        :aria-labelledby="tab === 'tree' ? 'tab-tree' : 'tab-memories'"
      >
        <AsyncState
          :state="store.loadState"
          :empty="isEmpty"
          @retry="store.open(treeId)"
        >
          <template #empty>
            <p>
              Nobody has been added to this tree yet. That is the whole point of
              this one — it is here to show what an empty tree looks like.
            </p>
          </template>

          <!-- The canvas: one block per generation, oldest first, with an
               arrow leading down to the next one. -->
          <div
            v-if="tab === 'tree'"
            class="canvas"
          >
            <div
              v-for="(column, index) in store.generations"
              :key="column.generation"
              class="column"
            >
              <h2 class="column__title">
                Generation {{ column.generation + 1 }}
              </h2>

              <ul class="column__list">
                <li
                  v-for="person in column.people"
                  :key="person.id"
                >
                  <button
                    type="button"
                    class="card"
                    :class="{ 'card--selected': person.id === selectedPersonId }"
                    :aria-pressed="person.id === selectedPersonId ? 'true' : 'false'"
                    @click="select(person.id)"
                  >
                    <span
                      class="card__avatar"
                      aria-hidden="true"
                    >{{ initials(person.fullName) }}</span>
                    <span class="card__name">{{ person.fullName }}</span>
                    <span
                      v-if="person.nickname"
                      class="card__nick"
                    >{{ person.nickname }}</span>
                    <span class="card__dates">{{ lifespan(person) }}</span>
                    <span
                      v-if="!unlinkedIds.has(person.id)"
                      class="card__flag"
                    >
                      not linked yet
                    </span>
                  </button>
                </li>
              </ul>

              <span
                v-if="index < store.generations.length - 1"
                class="arrow"
                aria-hidden="true"
              >↓</span>
            </div>
          </div>

          <!-- The same memory list the person page shows, widened to the
               whole tree: one endpoint, one comparator, one store. -->
          <div
            v-else
            class="tmemories"
          >
            <AsyncState
              :state="memories.list"
              :empty="noMemories"
              @retry="memories.fetchForTree(treeId)"
            >
              <template #empty>
                <p>No memories have been recorded in this tree yet.</p>
              </template>

              <ol class="tmemories__list">
                <li
                  v-for="memory in memories.list.data"
                  :key="memory.id"
                  class="tmemory"
                >
                  <div class="tmemory__head">
                    <h3 class="tmemory__title">
                      {{ memory.title }}
                    </h3>
                    <span
                      class="tmemory__vis"
                      :class="`tmemory__vis--${memory.visibility.toLowerCase()}`"
                    >
                      {{ memory.visibility === 'PRIVATE' ? 'only me' : 'whole tree' }}
                    </span>
                  </div>
                  <p class="tmemory__meta">
                    <RouterLink
                      :to="{
                        name: 'person',
                        params: { treeId, personId: memory.personId },
                      }"
                    >
                      {{ personName(memory.personId) }}
                    </RouterLink>
                    · {{ memory.happenedAt ?? 'no date recorded' }}
                  </p>
                  <p class="tmemory__body">
                    {{ memory.body }}
                  </p>
                </li>
              </ol>
            </AsyncState>
          </div>

          <aside
            v-if="tab === 'tree' && selectedPerson"
            class="panel"
            aria-live="polite"
          >
            <h2>{{ selectedPerson.fullName }}</h2>
            <p
              v-if="selectedPerson.bio"
              class="panel__bio"
            >
              {{ selectedPerson.bio }}
            </p>

            <div
              v-for="group in selectedFamily"
              :key="group.label"
              class="panel__group"
            >
              <h3>{{ group.label }}</h3>
              <p>
                <template
                  v-for="(person, i) in group.people"
                  :key="person.id"
                >
                  <span v-if="i > 0">, </span>
                  <RouterLink
                    :to="{ name: 'person', params: { treeId, personId: person.id } }"
                  >
                    {{ person.fullName }}
                  </RouterLink>
                </template>
              </p>
            </div>

            <RouterLink
              class="panel__open"
              :to="{ name: 'person', params: { treeId, personId: selectedPerson.id } }"
            >
              Open {{ selectedPerson.fullName }}'s page
            </RouterLink>
          </aside>
        </AsyncState>
      </div>
    </div>

    <button
      type="button"
      class="promo"
      :class="{ 'promo--on': tab === 'memories' }"
      :aria-pressed="tab === 'memories'"
      @click="showTab('memories')"
    >
      <span
        class="promo__icon"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
          <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
        </svg>
      </span>
      <span class="promo__text">
        <span class="promo__title">Family memories</span>
        <span class="promo__note">Preserve stories and photographs</span>
      </span>
    </button>
  </section>
</template>

<style scoped>
.crumb {
  font-size: 0.9rem;
  color: var(--text-muted);
}

/* ---- the header: what this tree is, and the one thing you can do ---- */

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 0.35rem;
}

.head__text {
  min-width: 0;
}

.head h1 {
  margin-bottom: 0.15rem;
}

.head__desc {
  font-size: 0.95rem;
  color: var(--text-muted);
}

.role {
  margin-top: 0.4rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.role__note {
  font-style: italic;
}

/* The page's one primary action — the reference's filled button, in the
   palette's own primary. It is only rendered where the role permits it. */
.head__action {
  display: inline-flex;
  align-items: center;
  min-height: var(--control-height);
  padding: 0 1.1rem;
  border-radius: var(--radius-control);
  background: var(--primary);
  color: var(--surface);
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.head__action:hover {
  background: color-mix(in srgb, var(--primary) 88%, var(--text));
  text-decoration: none;
}

/* ---- three counts ---- */

.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 1.1rem 0 1.25rem;
}

.stat {
  display: flex;
  flex-direction: column;
  /* The label wraps at 390px but not at 1280px. Pushing the value to the
     bottom of each card keeps the three numbers on one line whichever of
     the two is showing. */
  justify-content: space-between;
  padding: 0.6rem 0.85rem 0.7rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.stat__label {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.stat__value {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.25;
}

/* ---- the panel and its two tabs ---- */

.board {
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
  overflow: hidden;
}

.board__tabs {
  display: flex;
  gap: 0.35rem;
  padding: 0.5rem 0.6rem 0;
  background: var(--canvas);
  border-bottom: var(--hairline) solid var(--border);
}

.board__tab {
  display: inline-flex;
  align-items: center;
  min-height: var(--control-height);
  padding: 0 1rem;
  border: var(--hairline) solid transparent;
  border-bottom: none;
  border-radius: var(--radius-control) var(--radius-control) 0 0;
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.board__tab:hover {
  color: var(--primary);
}

/* The open tab takes the panel's own background and drops its bottom edge,
   so the two read as one sheet — the way the reference draws it. */
.board__tab--on {
  background: var(--surface);
  border-color: var(--border);
  color: var(--primary);
  margin-bottom: -1px;
}

/* ---- the canvas ---- */

.canvas {
  display: grid;
  justify-items: center;
  gap: 0.15rem;
  padding: 1.35rem 1rem 1.5rem;
}

.column {
  display: grid;
  justify-items: center;
  gap: 0.6rem;
  width: 100%;
}

.column__title {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
  font-variant: small-caps;
  letter-spacing: 0.1em;
  color: var(--text-muted);
}

.column__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
}

.arrow {
  color: var(--primary);
  font-size: 1.15rem;
  line-height: 1;
  padding: 0.1rem 0 0.3rem;
}

/* ---- a person card: avatar, name, years ---- */

/* Narrow enough that two cards still share a row at 390px, wide enough for
   the longest name in the seed to wrap rather than shrink. */
.card {
  display: grid;
  justify-items: center;
  gap: 0.15rem;
  width: 9rem;
  padding: 0.85rem 0.7rem 0.8rem;
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

/* Selected: the terracotta wash and ring, exactly as the reference screen
   draws it — a wash of colour, not a shadow. */
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
  width: 2.4rem;
  height: 2.4rem;
  margin-bottom: 0.25rem;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary);
  font-size: 0.8rem;
  font-weight: 700;
}

.card__name {
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.25;
}

.card__nick,
.card__dates {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.card__flag {
  font-size: 0.72rem;
  font-style: italic;
  color: var(--danger);
}

/* ---- the Memories tab: the person page's list, for the whole tree ---- */

.tmemories {
  padding: 1.1rem 1.1rem 1.25rem;
}

/* The panel already carries a border, so the state box inside it must not
   draw a second one. */
.tmemories .async {
  border: 0;
  padding: 0.9rem 0 0;
}

.tmemories__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}

.tmemory {
  padding: 0.75rem 0.9rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.tmemory__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.tmemory__title {
  margin: 0;
  font-size: 0.98rem;
}

.tmemory__vis {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
  color: var(--text-muted);
}

.tmemory__vis--private {
  color: var(--danger);
}

.tmemory__meta {
  margin: 0.15rem 0 0.4rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.tmemory__body {
  margin: 0;
  font-size: 0.92rem;
}

/* ---- the selected person's panel ---- */

.panel {
  margin-top: 1.5rem;
  padding: 1rem 1.1rem;
  border: var(--hairline) solid var(--border);
  border-left: 3px solid var(--primary);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.panel h2 {
  margin: 0 0 0.35rem;
  font-size: 1.05rem;
}

.panel__bio {
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
}

.panel__group h3 {
  margin: 0.6rem 0 0.15rem;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.panel__group p {
  margin: 0;
  font-size: 0.9rem;
}

.panel__open {
  display: inline-flex;
  align-items: center;
  min-height: var(--control-height);
  margin-top: 0.9rem;
  padding: 0 1rem;
  border-radius: var(--radius-control);
  background: var(--primary);
  color: var(--surface);
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
}

.panel__open:hover {
  background: color-mix(in srgb, var(--primary) 88%, var(--text));
  text-decoration: none;
}

/* ---- the link card at the bottom ---- */

.promo {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  margin-top: 1rem;
  padding: 0.9rem 1rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.promo:hover {
  border-color: var(--primary);
}

/* Already showing the memories it points at. */
.promo--on {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.promo__icon {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary);
}

.promo--on .promo__icon {
  background: var(--surface);
}

.promo__text {
  display: grid;
  gap: 0.1rem;
}

.promo__title {
  font-weight: 600;
}

.promo__note {
  font-size: 0.85rem;
  color: var(--text-muted);
}
</style>
