import { defineStore } from 'pinia';
import { compareMemoriesByDate, createMemory, listMemories } from '../services/api';
import type { Memory, MemoryVisibility } from '../types';
import { createAsync, run } from './asyncState';

/**
 * Memories of one person, and of the tree that person belongs to.
 *
 * FR-6.6 is enforced by the API, not here: the request carries no viewer,
 * so a view cannot accidentally render a PRIVATE memory it was never given.
 */
export const useMemoriesStore = defineStore('memories', () => {
  const list = createAsync<Memory[]>([]);

  /** The most recent write, kept separately from the list. */
  const created = createAsync<Memory | null>(null);

  async function fetchFor(treeId: string, personId: string): Promise<void> {
    await run(list, () => listMemories(treeId, { personId }));
  }

  /**
   * Every memory in the tree this viewer is allowed to see — the tree view's
   * memory count and its Memories tab.
   *
   * Same endpoint, same FR-6.6 filtering, only without the person scope: the
   * API drops a PRIVATE memory that is not the caller's either way, so a
   * count drawn here can never reveal that a private memory exists.
   */
  async function fetchForTree(treeId: string): Promise<void> {
    await run(list, () => listMemories(treeId));
  }

  async function create(input: {
    treeId: string;
    personId: string;
    title: string;
    body: string;
    happenedAt: string;
    visibility: MemoryVisibility;
  }): Promise<boolean> {
    let ok = false;

    await run(created, async () => {
      /* No author: the API reads the writer from the session cookie, which
         is the only place "who wrote this" can be taken from honestly. */
      const memory = await createMemory({
        treeId: input.treeId,
        personId: input.personId,
        title: input.title,
        body: input.body,
        happenedAt: input.happenedAt,
        visibility: input.visibility,
      });
      ok = true;
      return memory;
    });

    if (ok && created.data) {
      /* Put the new memory where the reader will see it, rather than making
         them refetch to find what they just wrote — using the service's own
         comparator, so the inserted position is the one a refetch would
         choose (FR-6.7). */
      const written = created.data;
      list.data = [
        written,
        ...list.data.filter((m) => m.id !== written.id),
      ].sort(compareMemoriesByDate);
      list.status = 'ready';
    }

    return ok;
  }

  function clearCreated(): void {
    created.data = null;
    created.error = null;
    created.status = 'idle';
  }

  return { list, created, fetchFor, fetchForTree, create, clearCreated };
});
