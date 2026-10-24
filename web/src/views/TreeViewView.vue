<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useStringParam, useStringQuery } from '../composables/useRouteString';

/**
 * /trees/:treeId — the family-tree canvas.
 *
 * This is the M1 checklist's detail page with a route parameter. Two pieces
 * of state are read from the URL rather than a store:
 *
 *   :treeId   which tree is open — required for the page to render at all;
 *   ?person=  which person is selected — so a link to one person can be
 *             shared and a refresh does not lose the selection.
 *
 * The canvas itself, the generation columns and the loading/empty/error
 * states are items 4 and 5.
 */
const router = useRouter();
const treeId = useStringParam('treeId');
const selectedPersonId = useStringQuery('person');

const treeName = computed(() => {
  /* Item 4 replaces this with the store lookup; it keeps the header honest
     about which tree is open while the canvas is still being built. */
  const names: Record<string, string> = {
    t1: 'Nguyễn family',
    t2: 'Trần family',
  };
  return names[treeId.value] ?? treeId.value;
});

function clearSelection(): void {
  /* Selection is route state, so clearing it is a route push, not a commit. */
  void router.push({ name: 'tree', params: { treeId: treeId.value } });
}
</script>

<template>
  <section>
    <p class="crumb">
      <RouterLink to="/">
        My trees
      </RouterLink> / {{ treeName }}
    </p>

    <h1>{{ treeName }}</h1>

    <dl class="params">
      <dt>treeId (route param)</dt>
      <dd><code>{{ treeId }}</code></dd>

      <dt>?person= (query)</dt>
      <dd>
        <code v-if="selectedPersonId">{{ selectedPersonId }}</code>
        <span
          v-else
          class="muted"
        >nobody selected</span>
      </dd>
    </dl>

    <p
      v-if="selectedPersonId"
      class="hint"
    >
      A link to this exact selection survives a refresh — which is why the
      selected person is in the URL and not in the store.
      <button
        type="button"
        @click="clearSelection"
      >
        Clear selection
      </button>
    </p>

    <p class="hint">
      Open a person:
      <RouterLink
        v-for="personId in ['p01', 'p04', 'p22']"
        :key="personId"
        class="person-link"
        :to="{ name: 'person', params: { treeId, personId } }"
      >
        {{ personId }}
      </RouterLink>
    </p>
  </section>
</template>

<style scoped>
.crumb {
  font-size: 0.9rem;
  color: var(--puong-muted, #6b6257);
}

.params {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 1rem;
  margin: 1.25rem 0;
  font-size: 0.9rem;
}

.params dt {
  color: var(--puong-muted, #6b6257);
}

.muted {
  color: var(--puong-muted, #6b6257);
}

.hint {
  margin: 1rem 0;
  font-size: 0.9rem;
  line-height: 1.7;
}

.person-link {
  margin-left: 0.5rem;
}

button {
  margin-left: 0.5rem;
}
</style>
