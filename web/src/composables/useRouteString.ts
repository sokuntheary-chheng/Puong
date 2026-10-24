import { computed } from 'vue';
import { useRoute } from 'vue-router';
import type { ComputedRef } from 'vue';

/**
 * Read a route parameter as a string.
 *
 * vue-router types `route.params` as `string | string[]` because a parameter
 * can legitimately repeat (`/trees/a,b`). Every parameterised route in this
 * application takes exactly one value, so a repeat is a mistyped URL rather
 * than something to render — normalising here keeps the views free of
 * `route.params.treeId ?? ''` at every use site.
 */
export function useStringParam(name: string): ComputedRef<string> {
  const route = useRoute();
  return computed(() => {
    const value = route.params[name];
    return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
  });
}

/**
 * Read a query parameter as a string.
 *
 * The selected person on the tree view and the search query live in the URL
 * rather than the store, so that a link to a person can be shared and a
 * refresh keeps the search (docs/design.md §3).
 */
export function useStringQuery(name: string): ComputedRef<string> {
  const route = useRoute();
  return computed(() => {
    const value = route.query[name];
    return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
  });
}
