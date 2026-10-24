<script setup lang="ts">
import { useStringParam } from '../composables/useRouteString';

/**
 * /trees/:treeId/people/:personId — the person page.
 *
 * The second parameterised route, and the place where a memory is attached:
 * the memory form is nested beneath this route rather than at
 * /memories/new, because a memory always belongs to a person and the person
 * has to be known before the form opens (docs/design.md §3).
 *
 * The profile itself, the derived completeness flag of FR-4.3 and the
 * memories list arrive with the store in item 4.
 */
const treeId = useStringParam('treeId');
const personId = useStringParam('personId');
</script>

<template>
  <section>
    <p class="crumb">
      <RouterLink to="/">
        My trees
      </RouterLink>
      /
      <RouterLink :to="{ name: 'tree', params: { treeId } }">
        tree {{ treeId }}
      </RouterLink>
      / {{ personId }}
    </p>

    <h1>Person {{ personId }}</h1>

    <dl class="params">
      <dt>treeId (route param)</dt>
      <dd><code>{{ treeId }}</code></dd>

      <dt>personId (route param)</dt>
      <dd><code>{{ personId }}</code></dd>
    </dl>

    <RouterLink
      class="add-memory"
      :to="{ name: 'memory-new', params: { treeId, personId } }"
    >
      Add a memory about {{ personId }}
    </RouterLink>
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

.add-memory {
  display: inline-block;
  margin-top: 1rem;
}
</style>
