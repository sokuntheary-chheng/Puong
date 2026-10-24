import { defineStore } from 'pinia';
import { ref } from 'vue';
import { SEARCH_PAGE_SIZE, search as searchApi } from '../services/mockApi';
import type { Page, SearchResult } from '../services/mockApi';
import type { MemoryVisibility } from '../mock/types';
import { useSessionStore } from './session';
import { createAsync, run } from './asyncState';

function emptyPage(): Page<SearchResult> {
  return { items: [], page: 1, pageSize: SEARCH_PAGE_SIZE, total: 0, totalPages: 0 };
}

/**
 * Search results (the stretch feature).
 *
 * The query and the page number deliberately live in the URL — `?q=` and
 * `?page=` — not here, so that a search can be shared as a link and survives
 * a refresh (design.md §3). This store holds only the *result* of searching,
 * which is the part that has to be fetched.
 */
export const useSearchStore = defineStore('search', () => {
  const session = useSessionStore();

  const result = createAsync<Page<SearchResult>>(emptyPage());

  /** The query these results belong to, so a stale result is recognisable. */
  const forQuery = ref('');

  async function search(input: {
    treeId: string;
    query: string;
    page: number;
    kind?: 'people' | 'memories';
    visibility?: MemoryVisibility;
  }): Promise<void> {
    forQuery.value = input.query;
    await run(result, () =>
      searchApi({ ...input, viewerId: session.currentUserId }),
    );
  }

  function reset(): void {
    result.data = emptyPage();
    result.error = null;
    result.status = 'idle';
    forQuery.value = '';
  }

  return { result, forQuery, search, reset };
});
