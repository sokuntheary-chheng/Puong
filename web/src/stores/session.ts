import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import * as api from '../services/api';
import type { User } from '../types';

/**
 * Who is signed in.
 *
 * This is the whole of M3 on the browser side: there is no user id to pick
 * and no token to hold. The session is an `httpOnly` cookie the browser
 * sends by itself, so all this store can honestly keep is *the account the
 * server says the cookie belongs to* — read once through `/auth/me` on the
 * first navigation, then updated by logging in or out.
 *
 * The three seeded accounts are therefore no longer a switcher: you are one
 * of them because you signed in as one, and the permission matrix in
 * docs/design.md §2 is checked by signing in as a different one.
 *
 * This is application state, not route state: it must survive navigation,
 * and it must not be settable from a URL.
 */
export const useSessionStore = defineStore('session', () => {
  const currentUser = ref<User | null>(null);

  /** Why `restore` could not answer, if it could not — a network failure. */
  const error = ref<string | null>(null);

  /** True once `/auth/me` has been asked, so the guard can wait for it. */
  const resolved = ref(false);

  const currentUserId = computed(() => currentUser.value?.id ?? '');
  const currentDisplayName = computed(
    () => currentUser.value?.displayName ?? 'Nobody signed in',
  );
  const isSignedIn = computed(() => currentUser.value !== null);

  let restoreRequest: Promise<void> | null = null;

  /**
   * Ask the server who the cookie is, once.
   *
   * Memoised as a promise rather than a flag because the router guard calls
   * it on *every* navigation: a second call must wait for the first rather
   * than race it, and neither may start a second request.
   *
   * A `401` is an answer, not a failure — "there is no session", which is
   * what a visitor gets. Anything else (the API not running, say) is kept in
   * `error` so the login form can say so instead of looking like a wrong
   * password.
   */
  function restore(): Promise<void> {
    const existing = restoreRequest;
    if (existing !== null) return existing;

    restoreRequest = (async () => {
      try {
        currentUser.value = await api.me();
      } catch (reason) {
        if (!(reason instanceof api.ApiError && reason.status === 401)) {
          error.value = reason instanceof Error ? reason.message : String(reason);
        }
        currentUser.value = null;
      } finally {
        resolved.value = true;
      }
    })();

    return restoreRequest;
  }

  /** Signs in and returns the account; the cookie is set by the response. */
  async function login(credentials: api.Credentials): Promise<User> {
    error.value = null;
    const user = await api.login(credentials);
    currentUser.value = user;
    return user;
  }

  /** Creates an account *and* signs in as it — one step, one cookie. */
  async function register(account: api.NewAccount): Promise<User> {
    error.value = null;
    const user = await api.register(account);
    currentUser.value = user;
    return user;
  }

  /**
   * Signs out. The cookie is cleared by the server even if this call fails,
   * so the local user goes too either way: showing somebody as signed in
   * after they asked to leave is worse than an unreported network error.
   */
  async function logout(): Promise<void> {
    try {
      await api.logout();
    } finally {
      currentUser.value = null;
    }
  }

  /* A 401 from *any* request means the cookie is no longer good — expired,
     revoked, cleared by another tab. Drop the user immediately so the header
     stops naming somebody the server no longer knows. */
  api.setUnauthorizedHandler(() => {
    currentUser.value = null;
  });

  return {
    currentUser,
    currentUserId,
    currentDisplayName,
    isSignedIn,
    error,
    resolved,
    restore,
    login,
    register,
    logout,
  };
});
