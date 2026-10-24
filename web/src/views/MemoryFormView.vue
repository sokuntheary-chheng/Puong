<script setup lang="ts">
import { useStringParam } from '../composables/useRouteString';

/**
 * /trees/:treeId/people/:personId/memories/new — the memory form.
 *
 * M1 item 3 places the route; item 5 builds the form and its client-side
 * validation (FR-6.2, FR-6.3). It is nested under the person on purpose:
 * a memory always belongs to one person, so the person has to be known
 * before the form opens.
 */
const treeId = useStringParam('treeId');
const personId = useStringParam('personId');
</script>

<template>
  <section>
    <p class="crumb">
      <RouterLink :to="{ name: 'person', params: { treeId, personId } }">
        {{ personId }}
      </RouterLink>
      / new memory
    </p>

    <h1>Add a memory</h1>

    <p class="hint">
      The form and its validation arrive with M1 item 5. The route already
      carries both parameters, so a memory cannot be started without knowing
      whose it is.
    </p>

    <dl class="params">
      <dt>treeId (route param)</dt>
      <dd><code>{{ treeId }}</code></dd>

      <dt>personId (route param)</dt>
      <dd><code>{{ personId }}</code></dd>
    </dl>
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

.hint {
  margin-top: 1.25rem;
  font-size: 0.9rem;
  color: var(--puong-muted, #6b6257);
}
</style>
