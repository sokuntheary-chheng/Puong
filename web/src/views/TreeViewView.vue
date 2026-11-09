<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AsyncState from '../components/AsyncState.vue';
import MemberInvite from '../components/MemberInvite.vue';
import PersonForm from '../components/PersonForm.vue';
import RelationForm from '../components/RelationForm.vue';
import TreeCanvas from '../components/TreeCanvas.vue';
import TreeSettings from '../components/TreeSettings.vue';
import { useStringParam, useStringQuery } from '../composables/useRouteString';
import { ApiError, deletePerson } from '../services/api';
import { useMemoriesStore } from '../stores/memories';
import { useSessionStore } from '../stores/session';
import { useTreeStore } from '../stores/tree';
import type { Person } from '../types';

/**
 * /trees/:treeId — the family tree, and the screen this application is
 * really about.
 *
 * The page is the frame; the graph is `TreeCanvas`. Everything here is
 * one of the reference's five regions — header, three counts, workspace
 * with its toolbar, and the two supporting cards below it — and none of
 * them knows how the graph is laid out or moved.
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
 * The two tabs, the zoom level and the pan position are *not* route state —
 * they are ways of looking at one tree, not facts about it
 * (docs/m1-explain.md), so they live here and die with the page.
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

/* ---- the toolbar's zoom controls ------------------------------------ */

const canvas = ref<InstanceType<typeof TreeCanvas> | null>(null);
const zoomPercent = ref(100);

/** Nothing to zoom while the tree is loading, empty, or not on screen. */
const canZoom = computed(
  () => tab.value === 'tree' && store.loadState.status === 'ready',
);

function zoomIn(): void {
  canvas.value?.zoomBy(1.2);
}

function zoomOut(): void {
  canvas.value?.zoomBy(1 / 1.2);
}

function fitTree(): void {
  canvas.value?.fit();
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
/* Selecting a person                                                  */
/* ------------------------------------------------------------------ */

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

function personName(personId: string): string {
  return store.find(personId)?.fullName ?? personId;
}

/* ------------------------------------------------------------------ */
/* M4 — the write actions this screen was missing                      */
/* ------------------------------------------------------------------ */

/**
 * Which of the two M4 forms is open. A panel rather than a route, for the
 * same reason the create-tree form on Home is one: these are two or three
 * fields over data that is already on screen, and a route would add a
 * guard, a loading state and a way to lose the tree you were editing.
 */
const panel = ref<'none' | 'new-person' | 'edit-person' | 'relations'>('none');
const editingPerson = ref<Person | null>(null);
const actionError = ref<string | null>(null);

const isOwner = computed(() => store.myRole === 'OWNER');

function openNewPerson(): void {
  actionError.value = null;
  editingPerson.value = null;
  panel.value = 'new-person';
}

function openEditPerson(person: Person): void {
  actionError.value = null;
  editingPerson.value = person;
  panel.value = 'edit-person';
}

function closePanel(): void {
  panel.value = 'none';
  editingPerson.value = null;
}

/**
 * FR-4.4 / FR-4.5 — who may edit a person.
 *
 * The API decides this too (and answers 403 when the browser's opinion is
 * wrong), so this is not the rule: it is the difference between a button
 * that works and a button that always fails. A contributor sees it on their
 * own records only; an owner sees it on all of them; a viewer never does.
 */
function mayEdit(person: Person | null): boolean {
  if (!store.canWrite || person === null) return false;
  if (isOwner.value) return true;
  return person.createdById === session.currentUserId;
}

function onPersonSaved(person: Person): void {
  store.putPerson(person);
  closePanel();
}

async function onDeletePerson(person: Person): Promise<void> {
  const confirmed = window.confirm(
    `Delete ${person.fullName} and everything attached to them — their links and memories? This cannot be undone.`,
  );
  if (!confirmed) return;

  actionError.value = null;
  try {
    await deletePerson(treeId.value, person.id);
    store.dropPerson(person.id);
    if (selectedPersonId.value === person.id) {
      panel.value = 'none';
      await router.push({ name: 'tree', params: { treeId: treeId.value } });
    }
  } catch (reason) {
    actionError.value =
      reason instanceof ApiError ? reason.message : 'That person could not be deleted.';
  }
}

/* ---- FR-8.3 — the two paths around the selected person ---- */

const ancestorIds = computed(() =>
  selectedPerson.value == null
    ? []
    : [...store.ancestorsOf(selectedPerson.value.id)],
);

const descendantIds = computed(() =>
  selectedPerson.value == null
    ? []
    : [...store.descendantsOf(selectedPerson.value.id)],
);

/**
 * The person the relation form starts on: whoever is selected, or — with
 * nobody selected — whoever is first. Never an empty select, which would
 * be a form that cannot be submitted for a reason nobody can see.
 */
const relationPersonId = computed(
  () => selectedPersonId.value || store.people.data[0]?.id || '',
);
</script>

<template>
  <section>
    <p class="crumb">
      <RouterLink to="/">
        My trees
      </RouterLink>
      / {{ store.tree.data?.name ?? treeId }}
    </p>

    <!-- 1. the family title: what this tree is, and the one thing you
         can do with it -->
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

      <div class="head__actions">
        <!-- M4 — the three writes this screen was missing. Every one of
             them is drawn only where the role permits it (FR-3.6), and the
             API refuses them again anyway: a hidden button is a courtesy,
             not a control. -->
        <button
          v-if="store.canWrite"
          type="button"
          class="head__secondary"
          @click="openNewPerson"
        >
          Add a person
        </button>

        <button
          v-if="store.canWrite && store.people.data.length > 1"
          type="button"
          class="head__secondary"
          @click="panel = panel === 'relations' ? 'none' : 'relations'"
        >
          Link relatives
        </button>

        <RouterLink
          v-if="store.canWrite && memoryTarget"
          class="head__action"
          :to="{
            name: 'memory-new',
            params: { treeId, personId: memoryTarget.id },
          }"
        >
          <svg
            class="head__actionicon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
          Add a memory
        </RouterLink>
      </div>
    </header>

    <!-- 2. three quiet counts — supporting information, not the feature -->
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

    <!-- M4 — the two forms, opened in place above the graph so that the
         tree they change stays visible behind them. -->
    <div class="m4forms">
      <PersonForm
        v-if="panel === 'new-person' || panel === 'edit-person'"
        :tree-id="treeId"
        :person="editingPerson"
        @saved="onPersonSaved"
        @close="closePanel"
      />

      <RelationForm
        v-if="panel === 'relations' && relationPersonId !== ''"
        :tree-id="treeId"
        :person-id="relationPersonId"
        @close="closePanel"
      />

      <p
        v-if="actionError"
        class="m4forms__error"
        role="alert"
      >
        {{ actionError }}
      </p>
    </div>

    <!-- 3. the workspace: toolbar above, graph below -->
    <div class="board">
      <div class="board__bar">
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
            <svg
              class="board__icon"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect
                x="9"
                y="2"
                width="6"
                height="5"
                rx="1.5"
              />
              <rect
                x="3"
                y="17"
                width="6"
                height="5"
                rx="1.5"
              />
              <rect
                x="15"
                y="17"
                width="6"
                height="5"
                rx="1.5"
              />
              <path d="M12 7v4M6 17v-3h12v3" />
            </svg>
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
            <svg
              class="board__icon"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect
                x="3"
                y="5"
                width="18"
                height="14"
                rx="2"
              />
              <path d="m3 16 5-4 4 3 3-3 6 5" />
              <circle
                cx="8.5"
                cy="9.5"
                r="1.5"
              />
            </svg>
            Memories
          </button>
        </div>

        <!-- These move the graph; they are not decoration. -->
        <div
          class="board__zoom"
          role="group"
          aria-label="Zoom the tree"
        >
          <button
            type="button"
            class="board__zoombtn"
            aria-label="Zoom out"
            :disabled="!canZoom"
            @click="zoomOut"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
            </svg>
          </button>
          <span
            class="board__level"
            aria-live="polite"
          >{{ zoomPercent }}%</span>
          <button
            type="button"
            class="board__zoombtn"
            aria-label="Zoom in"
            :disabled="!canZoom"
            @click="zoomIn"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button
            type="button"
            class="board__zoombtn"
            aria-label="Fit the tree to the screen"
            :disabled="!canZoom"
            @click="fitTree"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.9"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />
            </svg>
          </button>
        </div>
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

          <TreeCanvas
            v-if="tab === 'tree'"
            :key="treeId"
            ref="canvas"
            :generations="store.generations"
            :relations="store.relations.data"
            :selected-id="selectedPersonId"
            :ancestor-ids="ancestorIds"
            :descendant-ids="descendantIds"
            @select="select"
            @zoom-change="zoomPercent = $event"
          />

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

            <p
              v-if="ancestorIds.length + descendantIds.length > 0"
              class="panel__path"
            >
              Highlighted: {{ ancestorIds.length }} ancestor{{
                ancestorIds.length === 1 ? '' : 's'
              }},
              {{ descendantIds.length }} descendant{{
                descendantIds.length === 1 ? '' : 's'
              }}
              (FR-8.3).
            </p>

            <RouterLink
              class="panel__open"
              :to="{ name: 'person', params: { treeId, personId: selectedPerson.id } }"
            >
              Open {{ selectedPerson.fullName }}'s page
            </RouterLink>

            <!-- FR-4.4 / FR-4.6 — edit and delete, offered only where the
                 API would allow them. -->
            <div
              v-if="mayEdit(selectedPerson)"
              class="panel__write"
            >
              <button
                type="button"
                class="panel__btn"
                @click="openEditPerson(selectedPerson)"
              >
                Edit
              </button>
              <button
                type="button"
                class="panel__btn panel__btn--danger"
                @click="onDeletePerson(selectedPerson)"
              >
                Delete
              </button>
            </div>
          </aside>
        </AsyncState>
      </div>
    </div>

    <!-- 4. two supporting cards: one that works, one that is honest about
         not existing yet -->
    <div class="promos">
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
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
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

      <!-- Life events has no feature behind it yet, so it is drawn as what
           it is — a card that says so — rather than as a list of invented
           birthdays. -->
      <div class="promo promo--pending">
        <span
          class="promo__icon"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect
              x="3"
              y="5"
              width="18"
              height="16"
              rx="2"
            />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
        </span>
        <span class="promo__text">
          <span class="promo__title">Life events</span>
          <span class="promo__note">Birthdays, milestones, anniversaries</span>
          <span class="promo__pending">Not in M1 yet</span>
        </span>
      </div>
    </div>
    <!-- M4 — story 2's other half (inviting) and the owner's own panel:
         rename, delete, nominate a successor. TreeSettings draws its own
         sections conditionally, so the nominee's accept/decline lands here
         for whoever it is meant for without a second copy of it. -->
    <div class="m4sections">
      <MemberInvite
        v-if="isOwner"
        :tree-id="treeId"
      />
      <TreeSettings :tree-id="treeId" />
    </div>
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
  gap: 0.45rem;
  min-height: var(--control-height);
  padding: 0 1.1rem;
  border-radius: var(--radius-control);
  background: var(--primary);
  color: var(--surface);
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  transition: background-color 0.15s ease;
}

.head__action:hover {
  background: var(--primary-hover);
  text-decoration: none;
}

/* ---- three counts, kept quiet ---------------------------------------- */

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
  gap: 0.35rem;
  padding: 0.65rem 0.9rem 0.7rem;
  /* Linen on linen, so the cards read as a quiet strip rather than three
     more panels competing with the tree. */
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-card);
  background: var(--canvas);
}

.stat__label {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.stat__value {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1.2;
}

/* ---- the workspace --------------------------------------------------- */

.board {
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
  overflow: hidden;
}

.board__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.5rem 0.6rem;
  border-bottom: var(--hairline) solid var(--border);
  background: var(--surface);
}

.board__tabs {
  display: flex;
  gap: 0.35rem;
}

.board__tab {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: var(--control-height);
  padding: 0 0.9rem;
  border: var(--hairline) solid transparent;
  border-radius: var(--radius-control);
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

/* The open view: paper white, ringed so it reads as raised off the bar,
   terracotta icon, ink label — the reference's selected state. */
.board__tab--on {
  border-color: var(--border);
  background: var(--surface);
  color: var(--text);
}

.board__tab--on:hover {
  color: var(--text);
}

.board__tab--on .board__icon {
  color: var(--primary);
}

.board__icon {
  color: var(--text-muted);
  flex: 0 0 auto;
}

.board__zoom {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.board__zoombtn {
  display: inline-grid;
  place-items: center;
  width: 36px;
  min-height: 36px;
  padding: 0;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-control);
  background: var(--surface);
  color: var(--text);
}

.board__zoombtn:hover:not(:disabled) {
  color: var(--primary);
}

.board__zoombtn:disabled {
  opacity: 0.45;
}

.board__level {
  min-width: 3rem;
  text-align: center;
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}

.board__body {
  background: var(--surface);
}

/* The workspace already draws its own frame, so the state box inside it
   must not draw a second one — but an error keeps its accent. */
.board__body .async {
  border: 0;
  border-radius: 0;
  padding: 1rem;
}

.board__body .async--error {
  border-left: 3px solid var(--danger);
}

/* ---- the Memories tab: the person page's list, for the whole tree ---- */

.tmemories {
  padding: 1.1rem 1.1rem 1.25rem;
}

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

/* ---- the selected person's panel ------------------------------------- */

.panel {
  margin-top: 1.5rem;
  padding: 1rem 1.1rem;
  border-top: var(--hairline) solid var(--border);
  background: var(--surface);
  border-left: 3px solid var(--primary);
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
  background: var(--primary-hover);
  text-decoration: none;
}

/* ---- the two supporting cards ---------------------------------------- */

.promos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
  gap: 0.75rem;
  margin-top: 1rem;
}

.promo {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  width: 100%;
  padding: 1rem;
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

/* No feature behind this one, so it does not pretend to be a button. */
.promo--pending {
  cursor: default;
}

.promo--pending:hover {
  border-color: var(--border);
}

.promo__icon {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius-control);
  background: var(--primary-soft);
  color: var(--primary);
}

.promo--on .promo__icon {
  background: var(--surface);
}

.promo--pending .promo__icon {
  background: color-mix(in srgb, var(--success) 16%, var(--surface));
  color: var(--success);
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

.promo__pending {
  margin-top: 0.35rem;
  font-size: 0.75rem;
  font-style: italic;
  color: var(--text-muted);
}

/* ---- M4: the header's action group, and the forms it opens ---- */

.head__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
}

.head__secondary {
  min-height: var(--control-height);
  padding: 0 1rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-control);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.9rem;
  cursor: pointer;
}

.head__secondary:hover {
  border-color: var(--primary);
}

.m4forms {
  display: grid;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.m4forms__error {
  margin: 0;
  padding: 0.5rem 0.75rem;
  border: var(--hairline) solid var(--border);
  border-left: 3px solid var(--danger);
  border-radius: var(--radius-card);
  background: var(--surface);
  font-size: 0.88rem;
}

.m4sections {
  display: grid;
  gap: 0.75rem;
  margin-top: 1.25rem;
}

.panel__path {
  margin: 0.6rem 0 0;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.panel__write {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.6rem;
}

.panel__btn {
  font: inherit;
  font-size: 0.82rem;
  padding: 0.2rem 0.7rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-control);
  background: var(--surface);
  cursor: pointer;
}

.panel__btn--danger {
  border-color: var(--danger);
  color: var(--danger);
}
</style>
