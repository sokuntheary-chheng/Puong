import { watch } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import type { RouteLocationRaw } from 'vue-router';
import { useSessionStore } from '../stores/session';
import { useTreesStore } from '../stores/trees';

/**
 * What "/" means for the member who is signed in.
 *
 * One active tree is not a list — it is somewhere to go, so "/" opens that
 * tree's workspace. The list is drawn when there is a choice to make
 * instead: no trees at all, or more than one.
 *
 * "Not known yet" deliberately answers `true`. The view behind "/" is the
 * view that fetches the list, so letting the route enter keeps its loading
 * and its error state working exactly as they did; this then decides the
 * moment there is something to decide with.
 */
function homeEntry(): true | RouteLocationRaw {
  const store = useTreesStore();
  const only = store.trees.data.length === 1 ? store.trees.data[0] : undefined;

  if (store.trees.status !== 'ready' || only === undefined) return true;
  return { name: 'tree', params: { treeId: only.id } };
}

/**
 * M1 item 3 — six routes, two of them parameterised.
 *
 * Route state is deliberate, not incidental: anything that must survive a
 * refresh or be shareable as a URL lives in the route (docs/design.md §3).
 * The selected person on the tree view and the current search query are
 * therefore `?person=…` and `?q=…`, not store state.
 *
 * Views are lazy-loaded so that M2's real payloads are split per route
 * rather than shipped in the entry chunk.
 */
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      /* Public: the one screen that must work without a session, because it
         is how you get one. Also the redirect target the guard below sends
         everybody else to. */
      meta: { title: 'Log in', public: true },
    },
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
      meta: { title: 'My trees' },
      beforeEnter: homeEntry,
    },
    {
      path: '/trees/:treeId',
      name: 'tree',
      component: () => import('../views/TreeViewView.vue'),
      meta: { title: 'Family tree' },
    },
    {
      path: '/trees/:treeId/people/:personId',
      name: 'person',
      component: () => import('../views/PersonView.vue'),
      meta: { title: 'Person' },
    },
    {
      path: '/trees/:treeId/people/:personId/memories/new',
      name: 'memory-new',
      component: () => import('../views/MemoryFormView.vue'),
      meta: { title: 'Add a memory' },
    },
    {
      path: '/trees/:treeId/search',
      name: 'search',
      component: () => import('../views/SearchView.vue'),
      meta: { title: 'Search' },
    },

    /* Anything else is a mistyped URL, not a 404 page — M1 has no 404 view. */
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],

  /* Remember the scroll position when moving back up the tree. */
  scrollBehavior(to, from, saved) {
    if (saved) return saved;
    if (to.name === 'person' && from.name === 'tree') return { top: 0 };
    return { top: 0 };
  },
});

/**
 * Where `?next=` may send somebody after they sign in.
 *
 * Only a path inside this app. A value like `//elsewhere.example` would be a
 * protocol-relative URL — open-redirect territory — so it is refused rather
 * than sanitised, because refusing costs one comparison and sanitising costs
 * a rule somebody has to keep correct.
 */
function safeNext(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

/**
 * M3 — the session guard.
 *
 * Runs before every navigation and answers one question: may this screen be
 * shown to whoever the cookie says is here?
 *
 * - The session is resolved first (`session.restore()`), memoised, so the
 *   very first navigation waits for `/auth/me` instead of racing it —
 *   otherwise a refresh on a deep link would bounce a signed-in member
 *   through the login screen for the length of one request.
 * - **Not signed in** → `/login`, carrying where they were going in
 *   `?next=`, so signing in returns them to the page they asked for rather
 *   than to the front door.
 * - **Signed in and heading for `/login`** → back out to `?next=` or `/`:
 *   there is nothing to sign in to, and a login form that stays reachable
 *   is a login form somebody will fill in twice.
 * - Everything else is allowed, which includes every screen a *member* may
 *   be refused from by the API. The guard decides "signed in or not"; the
 *   role in one particular tree is the API's answer to give (404 for a tree
 *   you are not part of), because the browser's opinion of a role is not
 *   evidence.
 */
router.beforeEach(async (to) => {
  const session = useSessionStore();
  await session.restore();

  if (to.meta.public === true) {
    if (session.isSignedIn) return safeNext(to.query.next) ?? '/';
    return true;
  }

  if (!session.isSignedIn) {
    return { name: 'login', query: { next: to.fullPath } };
  }

  return true;
});

/* Each route names its own document title. */
router.afterEach((to) => {
  const title = to.meta.title as string | undefined;
  document.title = title ? `${title} · Puong` : 'Puong';
});

/*
 * `homeEntry` runs when "/" is *entered*. The list can also change while
 * "/" is already showing: the M1 account switcher changes who is signed in
 * without navigating anywhere, and the store refetches for the new member.
 * So the same decision is taken again for as long as "/" is the screen on
 * show — and stopped the moment it is not, so no watcher outlives the route
 * it is watching.
 */
let stopWatchingHome: (() => void) | null = null;

router.afterEach((to) => {
  if (stopWatchingHome !== null) {
    stopWatchingHome();
    stopWatchingHome = null;
  }
  if (to.name !== 'home') return;

  const store = useTreesStore();
  stopWatchingHome = watch(
    () => [store.trees.status, store.trees.data] as const,
    () => {
      const entry = homeEntry();
      if (entry !== true && router.currentRoute.value.name === 'home') {
        void router.replace(entry);
      }
    },
  );
});

export default router;
