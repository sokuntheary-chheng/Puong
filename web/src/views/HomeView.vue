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
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--puong-rule, #d8d2c6);
  border-radius: 6px;
  background: var(--puong-surface, #fffdf8);
}

.trees__link {
  font-weight: 600;
}

.trees__note {
  font-size: 0.85rem;
  color: var(--puong-muted, #6b6257);
}
</style>
