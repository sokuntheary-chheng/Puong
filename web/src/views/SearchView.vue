<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStringQuery } from '../composables/useRouteString';

/**
 * /trees/:treeId/search — the stretch feature's screen.
 *
 * The query lives in `?q=` rather than in a store, which is the point of the
 * rule in docs/design.md §3: a search can be shared as a link and survives a
 * refresh. Typing rewrites the URL with `replace` rather than `push`, so a
 * long query does not bury the back button under one history entry per
 * keystroke.
 *
 * Filtering, pagination and the result list are item 4.
 */
const route = useRoute();
const router = useRouter();
const query = useStringQuery('q');

const draft = ref(query.value);

watch(query, (next) => {
  if (next !== draft.value) draft.value = next;
});

let timer: ReturnType<typeof setTimeout> | undefined;

function onInput(): void {
  clearTimeout(timer);
  timer = setTimeout(() => {
    void router.replace({ name: 'search', params: { treeId: route.params.treeId }, query: { q: draft.value || undefined } });
  }, 250);
}
</script>

<template>
  <section>
    <p class="crumb">
      <RouterLink to="/">
        My trees
      </RouterLink>
      /
      <RouterLink :to="{ name: 'tree', params: { treeId: route.params.treeId } }">
        tree {{ route.params.treeId }}
      </RouterLink>
      / search
    </p>

    <h1>Search</h1>

    <label for="search-q">Name, nickname or memory text</label>
    <input
      id="search-q"
      v-model="draft"
      type="search"
      name="q"
      placeholder="e.g. An"
      @input="onInput"
    />

    <p class="hint">
      The address bar currently holds
      <code>{{ query ? `?q=${query}` : 'no query' }}</code> — copy it, open it
      in a new tab, and the same search comes back.
    </p>
  </section>
</template>

<style scoped>
.crumb {
  font-size: 0.9rem;
  color: var(--puong-muted, #6b6257);
}

label {
  display: block;
  margin: 1.25rem 0 0.35rem;
  font-size: 0.9rem;
}

input {
  width: 100%;
  max-width: 26rem;
  padding: 0.45rem 0.5rem;
  border: 1px solid var(--puong-rule, #d8d2c6);
  border-radius: 4px;
}

.hint {
  margin-top: 1.25rem;
  font-size: 0.9rem;
  color: var(--puong-muted, #6b6257);
}
</style>
