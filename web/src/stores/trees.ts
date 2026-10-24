import { defineStore } from 'pinia';
import { listTreesForUser } from '../services/mockApi';
import type { Tree } from '../mock/types';
import { useSessionStore } from './session';
import { createAsync, run } from './asyncState';

/**
 * The signed-in member's trees (FR-1.2).
 *
 * Depends on the session rather than holding a user id of its own: when M3
 * changes who is signed in, this list refetches and no view has to know that
 * the identity changed.
 */
export const useTreesStore = defineStore('trees', () => {
  const session = useSessionStore();

  const trees = createAsync<Tree[]>([]);

  async function fetch(): Promise<void> {
    if (session.currentUserId === '') return;
    await run(trees, () => listTreesForUser(session.currentUserId));
  }

  return { trees, fetch };
});
