<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import AsyncState from '../components/AsyncState.vue';
import { useStringParam, useStringQuery } from '../composables/useRouteString';
import { useTreeStore } from '../stores/tree';

/**
 * /trees/:treeId — the family-tree canvas.
 *
 * This is the M1 checklist's detail page with a route parameter.
 *
 * Two things are read from the URL rather than from the store:
 *
 *   :treeId   which tree is open — required for the page to render at all;
 *   ?person=  which person is selected — so a link to one person can be
 *             shared, and a refresh does not lose the selection.
 *
 * Selecting a person is therefore a route push, not a store commit: the two
 * must not be able to disagree.
 */
const store = useTreeStore();
const router = useRouter();

const treeId = useStringParam('treeId');
const selectedPersonId = useStringQuery('person');

onMounted(() => {
  void store.open(treeId.value);
});

/* Changing tree in place must reload — without this, navigating from one
   tree straight to another would keep showing the first one's people. */
watch(treeId, (next) => {
  if (next !== store.loadedTreeId) void store.open(next);
});

const isEmpty = computed(() => store.people.data.length === 0);

/** People with no relation to anyone — story 4 creates them, story 5 links them. */
const unlinkedIds = computed(() => {
  const linked = new Set<string>();
  for (const relation of store.relations.data) {
    linked.add(relation.fromId);
    linked.add(relation.toId);
  }
  return linked;
});

const selectedPerson = computed(() =>
  selectedPersonId.value === '' ? null : store.find(selectedPersonId.value),
);

const selectedFamily = computed(() =>
  selectedPerson.value ? store.familyOf(selectedPerson.value.id) : [],
);

function select(personId: string): void {
  void router.push({
    name: 'tree',
    params: { treeId: treeId.value },
    query: personId === selectedPersonId.value ? {} : { person: personId },
  });
}

function yearOf(date: string | null): string {
  return date === null ? '' : date.slice(0, 4);
}

function lifespan(person: { birthDate: string | null; deathDate: string | null }): string {
  const born = yearOf(person.birthDate);
  const died = yearOf(person.deathDate);
  if (born === '' && died === '') return '';
  return `${born || '?'} – ${died || ''}`.trim();
}
</script>

<template>
  <section>
    <p class="crumb">
      <RouterLink to="/">
        My trees
      </RouterLink>
      / {{ store.tree.data?.name ?? treeId }}
    </p>

    <header class="head">
      <h1>{{ store.tree.data?.name ?? 'Family tree' }}</h1>
      <p
        v-if="store.myRole"
        class="role"
      >
        You are <strong>{{ store.myRole.toLowerCase() }}</strong> here
        <span
          v-if="!store.canWrite"
          class="role__note"
        >— you can read, not write</span>
      </p>
    </header>

    <AsyncState
      :state="store.loadState"
      :empty="isEmpty"
      @retry="store.open(treeId)"
    >
      <template #empty>
        <p>
          Nobody has been added to this tree yet. That is the whole point of
          this one — it is here to show what an empty tree looks like.
        </p>
      </template>

      <div class="canvas">
        <div
          v-for="column in store.generations"
          :key="column.generation"
          class="column"
        >
          <h2 class="column__title">
            Generation {{ column.generation + 1 }}
          </h2>

          <ul class="column__list">
            <li
              v-for="person in column.people"
              :key="person.id"
            >
              <button
                type="button"
                class="card"
                :class="{ 'card--selected': person.id === selectedPersonId }"
                :aria-pressed="person.id === selectedPersonId ? 'true' : 'false'"
                @click="select(person.id)"
              >
                <span class="card__name">{{ person.fullName }}</span>
                <span
                  v-if="person.nickname"
                  class="card__nick"
                >{{ person.nickname }}</span>
                <span class="card__dates">{{ lifespan(person) }}</span>
                <span
                  v-if="!unlinkedIds.has(person.id)"
                  class="card__flag"
                >
                  not linked yet
                </span>
              </button>
            </li>
          </ul>
        </div>
      </div>

      <aside
        v-if="selectedPerson"
        class="panel"
        aria-live="polite"
      >
        <h2>{{ selectedPerson.fullName }}</h2>
        <p
          v-if="selectedPerson.bio"
          class="panel__bio"
        >
          {{ selectedPerson.bio }}
        </p>

        <div
          v-for="group in selectedFamily"
          :key="group.label"
          class="panel__group"
        >
          <h3>{{ group.label }}</h3>
          <p>
            <template
              v-for="(person, i) in group.people"
              :key="person.id"
            >
              <span v-if="i > 0">, </span>
              <RouterLink
                :to="{ name: 'person', params: { treeId, personId: person.id } }"
              >
                {{ person.fullName }}
              </RouterLink>
            </template>
          </p>
        </div>

        <RouterLink
          class="panel__open"
          :to="{ name: 'person', params: { treeId, personId: selectedPerson.id } }"
        >
          Open {{ selectedPerson.fullName }}'s page
        </RouterLink>
      </aside>
    </AsyncState>
  </section>
</template>

<style scoped>
.crumb {
  font-size: 0.9rem;
  color: var(--puong-muted, #6b6257);
}

.head {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  flex-wrap: wrap;
}

.head h1 {
  margin-bottom: 0;
}

.role {
  font-size: 0.85rem;
  color: var(--puong-muted, #6b6257);
}

.role__note {
  font-style: italic;
}

.canvas {
  display: flex;
  gap: 1.25rem;
  overflow-x: auto;
  padding: 1.25rem 0 0.5rem;
  align-items: flex-start;
}

.column {
  flex: 0 0 auto;
  min-width: 11rem;
}

.column__title {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--puong-muted, #6b6257);
  margin: 0 0 0.5rem;
}

.column__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
}

.card {
  display: grid;
  gap: 0.1rem;
  width: 100%;
  text-align: left;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--puong-rule, #d8d2c6);
  border-radius: 6px;
  background: var(--puong-surface, #fffdf8);
  font: inherit;
  cursor: pointer;
}

.card--selected {
  border-color: var(--puong-accent, #2f5d8a);
  box-shadow: 0 0 0 1px var(--puong-accent, #2f5d8a);
}

.card__name {
  font-weight: 600;
}

.card__nick,
.card__dates {
  font-size: 0.8rem;
  color: var(--puong-muted, #6b6257);
}

.card__flag {
  font-size: 0.75rem;
  font-style: italic;
  color: var(--puong-danger, #a4322a);
}

.panel {
  margin-top: 1.5rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--puong-rule, #d8d2c6);
  border-left: 4px solid var(--puong-accent, #2f5d8a);
  border-radius: 6px;
  background: var(--puong-surface, #fffdf8);
}

.panel h2 {
  margin: 0 0 0.35rem;
  font-size: 1.05rem;
}

.panel__bio {
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
}

.panel__group h3 {
  margin: 0.6rem 0 0.15rem;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--puong-muted, #6b6257);
}

.panel__group p {
  margin: 0;
  font-size: 0.9rem;
}

.panel__open {
  display: inline-block;
  margin-top: 0.9rem;
  font-size: 0.9rem;
}
</style>
