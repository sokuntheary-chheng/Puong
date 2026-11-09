<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AsyncState from '../components/AsyncState.vue';
import { useStringParam, useStringQuery } from '../composables/useRouteString';
import { useSearchStore } from '../stores/search';
import { useTreeStore } from '../stores/tree';
import type { SearchResult } from '../services/api';
import type { RelationType } from '../types';

/**
 * /trees/:treeId/search — the stretch feature.
 *
 * The query, the page **and the filters** live in the URL, not in the store,
 * so a search can be shared as a link and survives a refresh (design.md §3).
 * Typing rewrites the URL with `replace` rather than `push`, so a long query
 * does not bury the back button under one history entry per keystroke; a
 * filter change uses `push`, because that is a decision worth stepping back
 * from.
 *
 * FR-7.2 — the three people filters (`living`, `generation`, `relation`) are
 * people-only, so choosing `memories` as the kind drops them from the URL
 * rather than leaving them on screen where the API would refuse the pair
 * with a 400. The rule lives in the API; this is just the view not asking
 * for an answer it already knows it cannot have.
 */
const store = useSearchStore();
const tree = useTreeStore();
const router = useRouter();

const treeId = useStringParam('treeId');
const query = useStringQuery('q');
const page = useStringQuery('page');
const kind = useStringQuery('kind');
const living = useStringQuery('living');
const generation = useStringQuery('generation');
const relation = useStringQuery('relation');

const draft = ref(query.value);

/* A shared link, or the Back button, changes the URL without typing. */
watch(query, (next) => {
  if (next !== draft.value) draft.value = next;
});

/**
 * The generation options come from the family rule, not from a number the
 * view made up: `tree.generations` is `groupByGeneration()` over this tree's
 * own people, so the select cannot offer a generation the tree does not
 * have.
 *
 * The tree is opened here (once, guarded by the store's `loadedTreeId`)
 * because this view is reachable without ever visiting the tree page, and a
 * filter whose options depend on data that was never fetched is a filter
 * nobody can use.
 */
if (tree.loadedTreeId !== treeId.value) void tree.open(treeId.value);

const generationOptions = computed(() =>
  tree.generations.map((group) => ({
    value: String(group.generation),
    label: `Generation ${group.generation} · ${group.people.length}`,
  })),
);

const peopleKind = computed(() => kind.value !== 'memories');

/** True when anything at all was asked — an empty box alone searches nothing. */
const hasCriteria = computed(
  () =>
    query.value.trim() !== '' ||
    living.value !== '' ||
    generation.value !== '' ||
    relation.value !== '',
);

const isEmpty = computed(() => store.result.data.items.length === 0);

let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * The next URL, built from what is already there plus one change — and with
 * the page number dropped, because page 4 of a different question does not
 * exist. People filters are dropped as well whenever the kind is memories,
 * so the URL can never hold the pair the API answers 400 to.
 */
function nextQuery(patch: Record<string, string>): Record<string, string> {
  const merged: Record<string, string> = {
    q: draft.value.trim(),
    kind: kind.value,
    living: living.value,
    generation: generation.value,
    relation: relation.value,
    ...patch,
  };

  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (value === '') continue;
    if (key !== 'q' && key !== 'kind' && merged.kind === 'memories') continue;
    next[key] = value;
  }
  return next;
}

function onInput(): void {
  clearTimeout(timer);
  timer = setTimeout(() => {
    void router.replace({
      name: 'search',
      params: { treeId: treeId.value },
      query: nextQuery({}),
    });
  }, 250);
}

/** A filter is a choice, so it pushes history; the page number follows it. */
function onFilter(patch: Record<string, string>): void {
  void router.push({
    name: 'search',
    params: { treeId: treeId.value },
    query: nextQuery(patch),
  });
}

/** The `<select>` handlers read their own value: the URL has not changed yet. */
function valueOf(event: Event): string {
  return (event.target as HTMLSelectElement).value;
}

function onKindChange(event: Event): void {
  onFilter({ kind: valueOf(event) });
}

function onLivingChange(event: Event): void {
  onFilter({ living: valueOf(event) });
}

function onGenerationChange(event: Event): void {
  onFilter({ generation: valueOf(event) });
}

function onRelationChange(event: Event): void {
  onFilter({ relation: valueOf(event) });
}

function goToPage(next: number): void {
  void router.push({
    name: 'search',
    params: { treeId: treeId.value },
    query: { ...nextQuery({}), page: String(next) },
  });
}

async function search(): Promise<void> {
  await store.search({
    treeId: treeId.value,
    query: query.value,
    page: Number(page.value) || 1,
    kind: kind.value === 'people' || kind.value === 'memories' ? kind.value : undefined,
    living:
      living.value === 'true'
        ? true
        : living.value === 'false'
          ? false
          : undefined,
    generation:
      generation.value === '' ? undefined : Number(generation.value),
    relation: isRelationType(relation.value) ? relation.value : undefined,
  });
}

const RELATION_TYPES: RelationType[] = ['PARENT', 'SPOUSE', 'SIBLING', 'FRIEND'];

function isRelationType(value: string): value is RelationType {
  return (RELATION_TYPES as string[]).includes(value);
}

watch([query, page, kind, living, generation, relation], () => {
  void search();
});

/* Arriving with ?q= — or with only a filter — has to search once. */
if (hasCriteria.value) void search();

function titleOf(item: SearchResult): string {
  return item.kind === 'person' ? item.person.fullName : item.memory.title;
}

function detailOf(item: SearchResult): string {
  if (item.kind === 'person') {
    const parts = [item.person.nickname, item.person.birthDate?.slice(0, 4) ?? ''];
    return parts.filter(Boolean).join(' · ');
  }
  return [item.memory.happenedAt ?? 'no date', item.memory.visibility].join(' · ');
}

/** A memory has no page of its own yet, so its hit opens its person. */
function routeFor(item: SearchResult): Record<string, unknown> {
  const personId = item.kind === 'person' ? item.person.id : item.memory.personId;
  return { name: 'person', params: { treeId: treeId.value, personId } };
}

function onRetry(): void {
  void search();
}
</script>

<template>
  <section>
    <p class="crumb">
      <RouterLink to="/">
        My trees
      </RouterLink>
      /
      <RouterLink :to="{ name: 'tree', params: { treeId } }">
        tree {{ treeId }}
      </RouterLink>
      / search
    </p>

    <h1>Search</h1>

    <label for="search-q">Name, nickname or memory text</label>
    <input
      id="search-q"
      v-model="draft"
      type="search"
      name="q"
      placeholder="e.g. hoi an"
      @input="onInput"
    />

    <div class="filters">
      <p class="filters__title">
        Narrow it down <span class="filters__note">FR-7.2</span>
      </p>

      <div class="filters__row">
        <span class="field">
          <label for="search-kind">Show</label>
          <select
            id="search-kind"
            :value="kind"
            @change="onKindChange"
          >
            <option value="">
              Everything
            </option>
            <option value="people">
              People only
            </option>
            <option value="memories">
              Memories only
            </option>
          </select>
        </span>

        <span
          v-if="peopleKind"
          class="field"
        >
          <label for="search-living">Living</label>
          <select
            id="search-living"
            :value="living"
            @change="onLivingChange"
          >
            <option value="">
              Any
            </option>
            <option value="true">
              Living
            </option>
            <option value="false">
              Deceased
            </option>
          </select>
        </span>

        <span
          v-if="peopleKind"
          class="field"
        >
          <label for="search-generation">Generation</label>
          <select
            id="search-generation"
            :value="generation"
            @change="onGenerationChange"
          >
            <option value="">
              Any
            </option>
            <option
              v-for="option in generationOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </span>

        <span
          v-if="peopleKind"
          class="field"
        >
          <label for="search-relation">Relation</label>
          <select
            id="search-relation"
            :value="relation"
            @change="onRelationChange"
          >
            <option value="">
              Any
            </option>
            <option
              v-for="type in RELATION_TYPES"
              :key="type"
              :value="type"
            >
              {{ type.toLowerCase() }}
            </option>
          </select>
        </span>
      </div>

      <p
        v-if="!peopleKind"
        class="filters__note"
      >
        People filters are hidden for memories: a memory has no generation and
        no living status, so the API refuses the combination instead of
        pretending to apply it.
      </p>
    </div>

    <!-- The hint sits outside AsyncState: with no criteria nothing is ever
         requested, so the state stays 'idle' and the wrapper would render
         an empty region where the instructions should be. -->
    <p
      v-if="!hasCriteria"
      class="hint"
    >
      Type a name, a nickname, or a word from a memory — or pick a filter to
      browse. Accent-insensitive: “hoi an” finds “Hội An”. Ten results a
      page (FR-7.3).
    </p>

    <AsyncState
      v-else
      :state="store.result"
      :empty="isEmpty"
      @retry="onRetry"
    >
      <template #empty>
        <p>Nothing matches “{{ query }}”.</p>
      </template>

      <p class="count">
        {{ store.result.data.total }}
        result{{ store.result.data.total === 1 ? '' : 's' }},
        page {{ store.result.data.page }} of {{ store.result.data.totalPages }}
        · {{ store.result.data.pageSize }} per page
      </p>

      <ul class="results">
        <li
          v-for="(item, i) in store.result.data.items"
          :key="i"
        >
          <RouterLink
            class="result"
            :to="routeFor(item)"
          >
            <span class="result__kind">
              {{ item.kind === 'person' ? 'person' : 'memory' }}
            </span>
            <span class="result__title">{{ titleOf(item) }}</span>
            <span class="result__detail">{{ detailOf(item) }}</span>
          </RouterLink>
        </li>
      </ul>

      <nav
        v-if="store.result.data.totalPages > 1"
        class="pager"
        aria-label="Search pages"
      >
        <button
          type="button"
          :disabled="store.result.data.page <= 1"
          @click="goToPage(store.result.data.page - 1)"
        >
          Previous
        </button>
        <span class="pager__where">
          page {{ store.result.data.page }} of {{ store.result.data.totalPages }}
        </span>
        <button
          type="button"
          :disabled="store.result.data.page >= store.result.data.totalPages"
          @click="goToPage(store.result.data.page + 1)"
        >
          Next
        </button>
      </nav>
    </AsyncState>
  </section>
</template>

<style scoped>
.crumb {
  font-size: 0.9rem;
  color: var(--text-muted);
}

label {
  display: block;
  margin: 1.25rem 0 0.35rem;
  font-size: 0.9rem;
}

input {
  width: 100%;
  max-width: 26rem;
  padding: 0.45rem 0.5rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-control);
  font: inherit;
}

.filters {
  margin-top: 1rem;
  padding: 0.85rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.filters__title {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  font-weight: 600;
}

.filters__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.filters__note {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 400;
  color: var(--text-muted);
}

.field label {
  margin: 0 0 0.25rem;
}

.field select {
  display: block;
  min-width: 10rem;
  padding: 0.4rem 0.5rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-control);
  font: inherit;
  background: var(--surface);
}

.hint {
  margin-top: 1rem;
  font-size: 0.9rem;
  color: var(--text-muted);
}

.count {
  margin: 1.25rem 0 0.5rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.results {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
}

.result {
  display: grid;
  grid-template-columns: 4.5rem 1fr;
  gap: 0.1rem 0.75rem;
  padding: 0.65rem 0.85rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
  color: var(--text);
  text-decoration: none;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.result:hover {
  border-color: var(--primary);
  background: var(--primary-soft);
  text-decoration: none;
}

.result__kind {
  grid-row: span 2;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  align-self: center;
}

.result__title {
  font-weight: 600;
}

.result__detail {
  font-size: 0.82rem;
  color: var(--text-muted);
}

.pager {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
}

.pager__where {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.pager button {
  font: inherit;
  padding: 0 1rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-control);
  background: var(--surface);
  cursor: pointer;
}

.pager button:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
