<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AsyncState from '../components/AsyncState.vue';
import { useStringParam, useStringQuery } from '../composables/useRouteString';
import { useSearchStore } from '../stores/search';
import type { SearchResult } from '../services/mockApi';

/**
 * /trees/:treeId/search — the stretch feature.
 *
 * Both the query and the page live in the URL, not in the store, so a
 * search can be shared as a link and survives a refresh (design.md §3).
 * Typing rewrites the URL with `replace` rather than `push`, so a long
 * query does not bury the back button under one history entry per
 * keystroke.
 */
const store = useSearchStore();
const router = useRouter();

const treeId = useStringParam('treeId');
const query = useStringQuery('q');
const page = useStringQuery('page');

const draft = ref(query.value);

/* A shared link, or the Back button, changes the URL without typing. */
watch(query, (next) => {
  if (next !== draft.value) draft.value = next;
});

const isEmpty = computed(() => store.result.data.items.length === 0);
const hasQuery = computed(() => query.value.trim() !== '');

let timer: ReturnType<typeof setTimeout> | undefined;

function onInput(): void {
  clearTimeout(timer);
  timer = setTimeout(() => {
    void router.replace({
      name: 'search',
      params: { treeId: treeId.value },
      query: draft.value.trim() === '' ? {} : { q: draft.value },
    });
  }, 250);
}

function goToPage(next: number): void {
  void router.push({
    name: 'search',
    params: { treeId: treeId.value },
    query: { q: query.value, page: String(next) },
  });
}

async function search(): Promise<void> {
  await store.search({
    treeId: treeId.value,
    query: query.value,
    page: Number(page.value) || 1,
  });
}

watch([query, page], () => {
  void search();
});

/* Arriving with ?q= already set has to search once. */
if (hasQuery.value) void search();

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

    <!-- The hint sits outside AsyncState: with no query nothing is ever
         requested, so the state stays 'idle' and the wrapper would render
         an empty region where the instructions should be. -->
    <p
      v-if="!hasQuery"
      class="hint"
    >
      Type a name, a nickname, or a word from a memory. Accent-insensitive:
      “hoi an” finds “Hội An”.
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
  color: var(--puong-muted, #6b6257);
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
  border: 1px solid var(--puong-rule, #d8d2c6);
  border-radius: 4px;
  font: inherit;
}

.hint {
  margin-top: 1rem;
  font-size: 0.9rem;
  color: var(--puong-muted, #6b6257);
}

.count {
  margin: 1.25rem 0 0.5rem;
  font-size: 0.85rem;
  color: var(--puong-muted, #6b6257);
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
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--puong-rule, #d8d2c6);
  border-radius: 6px;
  background: var(--puong-surface, #fffdf8);
}

.result__kind {
  grid-row: span 2;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--puong-muted, #6b6257);
  align-self: center;
}

.result__title {
  font-weight: 600;
}

.result__detail {
  font-size: 0.82rem;
  color: var(--puong-muted, #6b6257);
}

.pager {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

.pager button {
  font: inherit;
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--puong-rule, #d8d2c6);
  border-radius: 4px;
  background: none;
  cursor: pointer;
}

.pager button:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
