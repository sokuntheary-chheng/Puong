import { defineStore } from 'pinia';
import { watch } from 'vue';
import { listTreesForUser } from '../services/mockApi';
import type { Tree } from '../mock/types';
import { useSessionStore } from './session';
import { createAsync, run } from './asyncState';

/**
 * The signed-in member's trees (FR-1.2).
 *
 * Depends on the session rather than holding a user id of its own: when the
 * identity changes, this refetches, because a list of one member's trees is
 * simply wrong for the next one.
 */
export const useTreesStore = defineStore('trees', () => {
  const session = useSessionStore();

  const trees = createAsync<Tree[]>([]);

  async function fetch(): Promise<void> {
    if (session.currentUserId === '') return;
    await run(trees, () => listTreesForUser(session.currentUserId));
  }

  watch(
    () => session.currentUserId,
    () => {
      void fetch();
    },
  );

  return { trees, fetch };
});
