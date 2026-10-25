<script setup lang="ts">
import { computed, onMounted } from 'vue';
import AsyncState from '../components/AsyncState.vue';
import { useTreesStore } from '../stores/trees';

/**
 * / — Home, the trees the signed-in member belongs to (FR-1.2, FR-1.3).
 *
 * The store is loaded once on mount. `fetch` is idempotent, so the retry
 * offered by AsyncState simply runs it again.
 */
const store = useTreesStore();

onMounted(() => {
  void store.fetch();
});

const isEmpty = computed(() => store.trees.data.length === 0);
</script>

<template>
  <section>
    <h1>My trees</h1>

    <AsyncState
      :state="store.trees"
      :empty="isEmpty"
      @retry="store.fetch()"
    >
      <template #empty>
        <p>
          You do not belong to a tree yet. Ask an owner to invite you, or
          create one.
        </p>
      </template>

      <ul class="trees">
        <li
          v-for="tree in store.trees.data"
          :key="tree.id"
          class="trees__item"
        >
          <RouterLink
            class="trees__link"
            :to="`/trees/${tree.id}`"
          >
            {{ tree.name }}
          </RouterLink>
          <span class="trees__note">{{ tree.description }}</span>
        </li>
      </ul>
    </AsyncState>
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
  display: grid;
  gap: 0.15rem;
  padding: 0.85rem 1rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
  transition: border-color 0.15s ease;
}

.trees__item:hover {
  border-color: var(--primary);
}

.trees__link {
  font-weight: 600;
  color: var(--text);
}

.trees__link:hover {
  color: var(--primary);
}

.trees__note {
  font-size: 0.85rem;
  color: var(--text-muted);
}
</style>
