import { defineStore } from 'pinia';
import { watch } from 'vue';
import { createTree, listMemories, listPeople, listTrees } from '../services/api';
import type { Tree } from '../types';
import { useSessionStore } from './session';
import { createAsync, run } from './asyncState';

/**
 * The signed-in member's trees (FR-1.2), and what is in them.
 *
 * Depends on the session rather than holding a user id of its own: the list
 * comes back already filtered to whoever the cookie belongs to, so when the
 * identity changes this refetches — and when there is no identity any more
 * it empties, because a list of one member's trees shown to nobody is still
 * somebody's private data.
 */
export const useTreesStore = defineStore('trees', () => {
  const session = useSessionStore();

  const trees = createAsync<Tree[]>([]);

  /**
   * People and memories summed over those trees — the counts the home
   * screen draws across the top.
   *
   * They live here rather than in the view because they are facts about
   * *this member's trees*, not about a screen: they follow the list's
   * lifecycle exactly (refetched on an identity change, retried by the same
   * button).
   */
  const counts = createAsync<{ people: number; memories: number }>({
    people: 0,
    memories: 0,
  });

  /** Only meaningful once the list it counts is in. */
  async function fetchCounts(): Promise<void> {
    if (trees.status !== 'ready') return;

    await run(counts, async () => {
      const [people, memories] = await Promise.all([
        Promise.all(trees.data.map((tree) => listPeople(tree.id))),
        Promise.all(trees.data.map((tree) => listMemories(tree.id))),
      ]);

      return {
        people: people.reduce((total, list) => total + list.length, 0),
        memories: memories.reduce((total, list) => total + list.length, 0),
      };
    });
  }

  /** FR-2.1 — make a tree; I become its OWNER in the same transaction. */
  async function create(input: {
    name: string;
    description?: string;
  }): Promise<Tree> {
    const tree = await createTree(input);
    /* Show it immediately rather than on the next visit — and refetch the
       counts, which are counts *of* this list and now include a new tree. */
    if (trees.status === 'ready') {
      trees.data = [...trees.data, tree];
      await fetchCounts();
    }
    return tree;
  }

  async function fetch(): Promise<void> {
    if (session.currentUserId === '') {
      /* Signed out: drop what the last account could see. Kept as a reset
         rather than a fetch, because there is nothing to ask for. */
      trees.data = [];
      trees.status = 'idle';
      trees.error = null;
      counts.data = { people: 0, memories: 0 };
      counts.status = 'idle';
      counts.error = null;
      return;
    }

    await run(trees, () => listTrees());
    /* Second, not alongside: the totals are totals *of* this list, and a
       failed list must not leave them counting the previous member's. */
    await fetchCounts();
  }

  watch(
    () => session.currentUserId,
    () => {
      void fetch();
    },
  );

  return { trees, counts, create, fetch };
});
