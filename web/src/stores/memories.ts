import { defineStore } from 'pinia';
import {
  compareMemoriesByDate,
  createMemory,
  deleteMemory,
  listMemories,
  updateMemory,
} from '../services/api';
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
    /**
     * FR-6.2 — the url an upload returned, not the file: the photograph
     * goes up on its own request (the one multipart call in `services/api`),
     * and only its url is part of this body. Passing the file here would
     * silently send a JSON object where the API expects multipart, which is
     * exactly the bug that makes an upload "succeed" with nothing stored.
     */
    photoUrl?: string | null;
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
        photoUrl: input.photoUrl ?? undefined,
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

  /**
   * FR-6.4 — edit a memory in place.
   *
   * The list is updated rather than refetched: one record's text changed,
   * and the sort order is the only thing that can move with it, so the
   * service's own comparator re-settles the position. It rethrows, because
   * "you may not edit this memory" (FR-6.5) is a sentence the view has to
   * show the user, not a state to swallow.
   */
  async function update(
    treeId: string,
    memoryId: string,
    input: {
      title?: string;
      body?: string;
      happenedAt?: string;
      visibility?: MemoryVisibility;
      photoUrl?: string | null;
    },
  ): Promise<void> {
    const updated = await updateMemory(treeId, memoryId, input);
    list.data = list.data
      .map((memory) => (memory.id === updated.id ? updated : memory))
      .sort(compareMemoriesByDate);
  }

  /** FR-6.4 / FR-6.8 — remove it, and everything the reader sees with it. */
  async function remove(treeId: string, memoryId: string): Promise<void> {
    await deleteMemory(treeId, memoryId);
    list.data = list.data.filter((memory) => memory.id !== memoryId);
  }

  return {
    list,
    created,
    fetchFor,
    fetchForTree,
    create,
    clearCreated,
    update,
    remove,
  };
});
