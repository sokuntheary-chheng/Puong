<script setup lang="ts">
/**
 * / — Home, the list of trees the signed-in member belongs to.
 *
 * M1 item 3 wires the route; the list itself comes from the Pinia store in
 * item 4 (FR-1.2, FR-1.3). The two seeded trees are linked directly for now
 * so the routed application can be walked end to end before the store exists.
 */
const seededTrees = [
  { id: 't1', name: 'Nguyễn family', note: 'Four generations' },
  { id: 't2', name: 'Trần family', note: 'Nothing recorded yet' },
];
</script>

<template>
  <section>
    <h1>My trees</h1>

    <ul class="trees">
      <li
        v-for="tree in seededTrees"
        :key="tree.id"
        class="trees__item"
      >
        <RouterLink :to="`/trees/${tree.id}`">
          {{ tree.name }}
        </RouterLink>
        <span class="trees__note">{{ tree.note }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.trees {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}

.trees__item {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--puong-rule, #d8d2c6);
  border-radius: 6px;
}

.trees__note {
  font-size: 0.85rem;
  color: var(--puong-muted, #6b6257);
}
</style>
