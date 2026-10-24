import { defineStore } from 'pinia';
import { compareMemoriesByDate, createMemory, listMemories } from '../services/mockApi';
import type { Memory, MemoryVisibility } from '../mock/types';
import { useSessionStore } from './session';
import { createAsync, run } from './asyncState';

/**
 * Memories of one person.
 *
 * FR-6.6 is enforced in the service, not here: the API is handed the viewer
 * and returns only what that viewer may see, so a view cannot accidentally
 * render a PRIVATE memory it was never given.
 */
export const useMemoriesStore = defineStore('memories', () => {
  const session = useSessionStore();

  const list = createAsync<Memory[]>([]);

  /** The most recent write, kept separately from the list. */
  const created = createAsync<Memory | null>(null);

  async function fetchFor(treeId: string, personId: string): Promise<void> {
    await run(list, () =>
      listMemories(treeId, { personId, viewerId: session.currentUserId }),
    );
  }

  async function create(input: {
    treeId: string;
    personId: string;
    title: string;
    body: string;
    happenedAt: string;
    visibility: MemoryVisibility;
  }): Promise<boolean> {
    const authorId = session.currentUserId;
    let ok = false;

    await run(created, async () => {
      const memory = await createMemory({
        treeId: input.treeId,
        personId: input.personId,
        authorId,
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

  return { list, created, fetchFor, create, clearCreated };
});
