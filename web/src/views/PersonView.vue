<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import AsyncState from '../components/AsyncState.vue';
import { useStringParam } from '../composables/useRouteString';
import { useMemoriesStore } from '../stores/memories';
import { useSessionStore } from '../stores/session';
import { useTreeStore } from '../stores/tree';

/**
 * /trees/:treeId/people/:personId — the person page.
 *
 * The tree is loaded only if it is not already open: arriving here directly
 * from a shared link has to fetch everything, but walking from the tree view
 * must not refetch what is already in memory.
 *
 * FR-6.6 is enforced in the service, so a PRIVATE memory is simply absent
 * for anyone but its author. The view never filters, and therefore cannot
 * get the rule wrong.
 */
const treeStore = useTreeStore();
const memories = useMemoriesStore();
const session = useSessionStore();

const treeId = useStringParam('treeId');
const personId = useStringParam('personId');

const person = computed(() => treeStore.find(personId.value));
const family = computed(() => treeStore.familyOf(personId.value));
const noMemories = computed(() => memories.list.data.length === 0);

async function load(): Promise<void> {
  if (treeStore.loadedTreeId !== treeId.value) {
    await treeStore.open(treeId.value);
  }
  await memories.fetchFor(treeId.value, personId.value);
}

onMounted(() => {
  void load();
});

watch([treeId, personId], () => {
  void load();
});

/* FR-6.6 — a PRIVATE memory belongs to its author, so who is asking changes
   the answer. Switching identity has to refetch, or the view would keep
   showing the previous viewer's memories. */
watch(
  () => session.currentUserId,
  () => {
    void memories.fetchFor(treeId.value, personId.value);
  },
);

function formatDate(value: string | null): string {
  return value === null ? 'not recorded' : value;
}
</script>

<template>
  <section>
    <p class="crumb">
      <RouterLink to="/">
        My trees
      </RouterLink>
      /
      <RouterLink :to="{ name: 'tree', params: { treeId } }">
        {{ treeStore.tree.data?.name ?? treeId }}
      </RouterLink>
      / {{ person?.fullName ?? personId }}
    </p>

    <AsyncState
      :state="treeStore.loadState"
      :empty="person === undefined"
      @retry="treeStore.open(treeId)"
    >
      <template #empty>
        <p>There is nobody with that id in this tree.</p>
      </template>

      <h1>{{ person?.fullName }}</h1>

      <dl class="facts">
        <dt>Nickname</dt>
        <dd>{{ person?.nickname ?? 'not recorded' }}</dd>

        <dt>Born</dt>
        <dd>{{ formatDate(person?.birthDate ?? null) }}</dd>

        <dt>Died</dt>
        <dd>{{ person?.isLiving ? 'living' : formatDate(person?.deathDate ?? null) }}</dd>
      </dl>

      <p
        v-if="person?.bio"
        class="bio"
      >
        {{ person.bio }}
      </p>

      <div
        v-for="group in family"
        :key="group.label"
        class="group"
      >
        <h2>{{ group.label }}</h2>
        <p>
          <template
            v-for="(relative, i) in group.people"
            :key="relative.id"
          >
            <span v-if="i > 0">, </span>
            <RouterLink
              :to="{ name: 'person', params: { treeId, personId: relative.id } }"
            >
              {{ relative.fullName }}
            </RouterLink>
          </template>
        </p>
      </div>

      <hr />

      <div class="memories__head">
        <h2>Memories</h2>
        <RouterLink
          v-if="treeStore.canWrite"
          class="memories__add"
          :to="{ name: 'memory-new', params: { treeId, personId } }"
        >
          Add a memory
        </RouterLink>
        <p
          v-else
          class="memories__readonly"
        >
          Only an owner or a contributor can add a memory here.
        </p>
      </div>

      <AsyncState
        :state="memories.list"
        :empty="noMemories"
        @retry="memories.fetchFor(treeId, personId)"
      >
        <template #empty>
          <p>No memories have been recorded for {{ person?.fullName }} yet.</p>
        </template>

        <ol class="memories">
          <li
            v-for="memory in memories.list.data"
            :key="memory.id"
            class="memory"
          >
            <div class="memory__title">
              <h3>{{ memory.title }}</h3>
              <span
                class="memory__vis"
                :class="`memory__vis--${memory.visibility.toLowerCase()}`"
              >
                {{ memory.visibility === 'PRIVATE' ? 'only me' : 'whole tree' }}
              </span>
            </div>
            <p class="memory__meta">
              {{ memory.happenedAt ?? 'no date recorded' }}
            </p>
            <p class="memory__body">
              {{ memory.body }}
            </p>
          </li>
        </ol>
      </AsyncState>
    </AsyncState>
  </section>
</template>

<style scoped>
.crumb {
  font-size: 0.9rem;
  color: var(--text-muted);
}

.facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.2rem 1rem;
  margin: 1rem 0;
  font-size: 0.9rem;
}

.facts dt {
  color: var(--text-muted);
}

.facts dd {
  margin: 0;
}

.bio {
  max-width: 40rem;
}

.group h2 {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin: 1rem 0 0.15rem;
}

.group p {
  margin: 0;
  font-size: 0.9rem;
}

.memories__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.memories__head h2 {
  margin-bottom: 0.75rem;
}

/* The page's one action, drawn like the reference's primary button. */
.memories__add {
  display: inline-flex;
  align-items: center;
  min-height: var(--control-height);
  padding: 0 1rem;
  border-radius: var(--radius-control);
  background: var(--primary);
  color: var(--surface);
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
}

.memories__add:hover {
  background: color-mix(in srgb, var(--primary) 88%, var(--text));
  text-decoration: none;
}

.memories__readonly {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.memories {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}

.memory {
  padding: 0.75rem 0.9rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.memory__title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.memory__title h3 {
  margin: 0;
  font-size: 0.98rem;
}

.memory__vis {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
  color: var(--text-muted);
}

.memory__vis--private {
  color: var(--danger);
}

.memory__meta {
  margin: 0.15rem 0 0.4rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.memory__body {
  margin: 0;
  font-size: 0.92rem;
}
</style>
