import { defineStore } from 'pinia';
import { ref } from 'vue';
import { listInvitations, listSuccessorships } from '../services/api';
import type { Invitation, Successorship } from '../types';
import type { AsyncState } from './asyncState';
import { createAsync, run } from './asyncState';
import { useSessionStore } from './session';

/**
 * What is waiting for *my* answer: an invitation (FR-3.2) and a nomination
 * (FR-9.1).
 *
 * It lives in a store rather than inside HomeView because the route guard
 * needs it before the view exists. "/" redirects a single-tree member
 * straight into that tree — a nice shortcut right up until there is an
 * invitation to that very member waiting on the home page, where the
 * shortcut would hide the one screen that could answer it. So the guard
 * asks *this*: if anything is pending, home stays home, and the view then
 * reads the same state instead of fetching it a second time.
 *
 * Both lists are answered per session by the API (an invitation nobody has
 * accepted appears only for its invitee), so there is nothing here to
 * filter by user.
 */
export const useInboxStore = defineStore('inbox', () => {
  const session = useSessionStore();

  const invitations = createAsync<Invitation[]>([]);
  const nominations = createAsync<Successorship[]>([]);

  /**
   * Whose answer these two lists are.
   *
   * Without it the store would happily keep the previous member's inbox:
   * signing out and in again is an SPA navigation, no component remounts to
   * notice, and the new member would be shown somebody else's "waiting for
   * you" — or, worse, an empty one that stops the home page from asking
   * again. Comparing the id on every `load()` is cheaper than remembering
   * to clear the store at exactly the right moment in three different
   * places.
   */
  const loadedFor = ref('');

  /**
   * The request currently in flight for each list, if any.
   *
   * Two callers ask at nearly the same moment: the route guard, and the
   * view it is about to render. The second must *wait* for the first's
   * answer. Without this it sees `status: 'loading'`, skips the fetch, reads
   * an empty list as "nothing pending" and redirects — which is exactly how
   * a nomination can be sitting in the database while the nominee is
   * carried past the page that tells them about it.
   */
  const inflight: {
    invitations: Promise<void> | null;
    nominations: Promise<void> | null;
  } = { invitations: null, nominations: null };

  function ensure<T>(
    state: AsyncState<T[]>,
    key: 'invitations' | 'nominations',
    fetch: () => Promise<T[]>,
  ): Promise<void> {
    const pending = inflight[key];
    if (pending !== null) return pending;
    if (state.status !== 'idle') return Promise.resolve();

    /* Both outcomes clear the slot, and neither rejects: `run` has already
       recorded the failure in `state.error`, and a guard that lets the
       rejection escape would turn "the API is down" into a broken
       navigation instead of a home page with a retry on it. */
    const clear = (): void => {
      inflight[key] = null;
    };

    const started = run(state, fetch).then(clear, clear);
    inflight[key] = started;
    return started;
  }

  /**
   * Fetch once per member. The guard and the view both call it, and the
   * second call finds the state already `ready` — a route guard that
   * re-requested on every navigation would put a round trip in front of "/"
   * forever.
   *
   * A failure is deliberately *not* swallowed into an empty list: `run`
   * records it, and the view shows its retry. The guard treats a failure as
   * "nothing pending" and redirects, because refusing to enter home while
   * the API is down would strand the member with no screen at all.
   */
  async function load(): Promise<void> {
    if (loadedFor.value !== session.currentUserId) {
      loadedFor.value = session.currentUserId;
      reset();
    }

    await Promise.all([
      ensure(invitations, 'invitations', listInvitations),
      ensure(nominations, 'nominations', listSuccessorships),
    ]);
  }

  /**
   * Re-read both lists — after answering one, and when the member changes.
   * Unlike `load`, this runs whether or not the state is already ready,
   * because the whole point is that the answer has moved on.
   */
  async function refresh(): Promise<void> {
    loadedFor.value = session.currentUserId;
    inflight.invitations = null;
    inflight.nominations = null;

    const settled = <T>(promise: Promise<T>): Promise<void> =>
      promise.then(
        () => undefined,
        () => undefined,
      );

    await Promise.all([
      settled(run(invitations, listInvitations)),
      settled(run(nominations, listSuccessorships)),
    ]);
  }

  /** Back to "never asked", so the next member starts from a clean slate. */
  function reset(): void {
    inflight.invitations = null;
    inflight.nominations = null;
    for (const state of [invitations, nominations]) {
      state.status = 'idle';
      state.error = null;
    }
  }

  return { invitations, nominations, load, refresh, reset };
});
