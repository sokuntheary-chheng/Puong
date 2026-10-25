import { watch } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import type { RouteLocationRaw } from 'vue-router';
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
      meta: { title: 'Log in' },
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

/* Each route names its own document title; M3 adds the auth guard here. */
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
