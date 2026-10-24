import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { listUsers } from '../services/mockApi';
import type { User } from '../mock/types';
import { createAsync, run } from './asyncState';

/**
 * Who is signed in.
 *
 * M3 replaces `currentUserId` with a real session and a login flow. Until
 * then it is switchable between the three seeded accounts, because the
 * permission matrix in design.md §2 is otherwise something a reader has to
 * take on trust: switching to `viewer@puong.dev` and watching the write
 * controls disappear is what makes FR-3.6 and FR-6.5 checkable by hand.
 *
 * This is application state, not route state: it must survive navigation,
 * and it must not be settable from a URL.
 */
export const useSessionStore = defineStore('session', () => {
  const users = createAsync<User[]>([]);

  const currentUserId = ref('u1');

  const currentUser = computed(
    () => users.data.find((u) => u.id === currentUserId.value) ?? null,
  );

  const currentDisplayName = computed(
    () => currentUser.value?.displayName ?? 'Nobody signed in',
  );

  async function fetchUsers(): Promise<void> {
    await run(users, () => listUsers());
  }

  function switchTo(userId: string): void {
    currentUserId.value = userId;
  }

  return { users, currentUserId, currentUser, currentDisplayName, fetchUsers, switchTo };
});
