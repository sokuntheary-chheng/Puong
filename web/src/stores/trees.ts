import { defineStore } from 'pinia';
import { watch } from 'vue';
import { listMemories, listPeople, listTreesForUser } from '../services/mockApi';
import type { Tree } from '../mock/types';
import { useSessionStore } from './session';
import { createAsync, run } from './asyncState';

/**
 * The signed-in member's trees (FR-1.2), and what is in them.
 *
 * Depends on the session rather than holding a user id of its own: when the
 * identity changes, this refetches, because a list of one member's trees is
 * simply wrong for the next one.
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
   * button). M2 replaces the calls below with one aggregate endpoint.
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
        Promise.all(
          trees.data.map((tree) =>
            listMemories(tree.id, { viewerId: session.currentUserId }),
          ),
        ),
      ]);

      return {
        people: people.reduce((total, list) => total + list.length, 0),
        memories: memories.reduce((total, list) => total + list.length, 0),
      };
    });
  }

  async function fetch(): Promise<void> {
    if (session.currentUserId === '') return;
    await run(trees, () => listTreesForUser(session.currentUserId));
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

  return { trees, counts, fetch };
});
