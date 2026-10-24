import { createRouter, createWebHistory } from 'vue-router';

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

export default router;
