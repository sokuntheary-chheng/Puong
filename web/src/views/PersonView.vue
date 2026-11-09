<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AsyncState from '../components/AsyncState.vue';
import PersonForm from '../components/PersonForm.vue';
import { useStringParam } from '../composables/useRouteString';
import { ApiError, deletePerson } from '../services/api';
import { useMemoriesStore } from '../stores/memories';
import { useSessionStore } from '../stores/session';
import { useTreeStore } from '../stores/tree';
import type { Memory, Person } from '../types';

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
 *
 * M4 adds the two writes this page owes its reader: editing and deleting
 * the person (FR-4.4, FR-4.6), and editing and deleting their memories
 * (FR-6.4). Both are offered only where the API would allow them — the
 * button's presence is a forecast of the server's answer, and when the
 * forecast is wrong the server wins and the sentence it returns is shown.
 */
const treeStore = useTreeStore();
const memories = useMemoriesStore();
const session = useSessionStore();
const router = useRouter();

const treeId = useStringParam('treeId');
const personId = useStringParam('personId');

const person = computed(() => treeStore.find(personId.value));
const family = computed(() => treeStore.familyOf(personId.value));
const noMemories = computed(() => memories.list.data.length === 0);

const actionError = ref<string | null>(null);
const editing = ref(false);

/** FR-4.4 / FR-4.5 — the owner curates, a contributor edits their own. */
const mayEdit = computed(() => {
  const target = person.value;
  if (!treeStore.canWrite || target === undefined) return false;
  if (treeStore.myRole === 'OWNER') return true;
  return target.createdById === session.currentUserId;
});

/** FR-6.4 / FR-6.5 — a memory may be edited only by the member who wrote it. */
function mayEditMemory(memory: Memory): boolean {
  return (
    treeStore.canWrite && memory.authorId === session.currentUserId
  );
}

/**
 * FR-6.8 — an owner may delete somebody else's memory only when the whole
 * tree can see it, and never a private one. The author may delete either of
 * their own.
 */
function mayDeleteMemory(memory: Memory): boolean {
  if (!treeStore.canWrite) return false;
  if (memory.authorId === session.currentUserId) return true;
  return treeStore.myRole === 'OWNER' && memory.visibility === 'TREE';
}

function onPersonSaved(saved: Person): void {
  treeStore.putPerson(saved);
  editing.value = false;
}

async function onDeletePerson(): Promise<void> {
  const target = person.value;
  if (target === undefined) return;

  const confirmed = window.confirm(
    `Delete ${target.fullName} and everything attached to them — their links and memories? This cannot be undone.`,
  );
  if (!confirmed) return;

  actionError.value = null;
  try {
    await deletePerson(treeId.value, target.id);
    treeStore.dropPerson(target.id);
    await router.push({ name: 'tree', params: { treeId: treeId.value } });
  } catch (reason) {
    actionError.value =
      reason instanceof ApiError ? reason.message : 'That person could not be deleted.';
  }
}

/* ---- a memory's own edit and delete (FR-6.4) ---- */

const editingMemoryId = ref('');
const draftTitle = ref('');
const draftBody = ref('');
const draftHappenedAt = ref('');
const draftVisibility = ref<Memory['visibility']>('TREE');
const memoryError = ref<string | null>(null);
const memoryBusy = ref(false);

function startEditMemory(memory: Memory): void {
  editingMemoryId.value = memory.id;
  draftTitle.value = memory.title;
  draftBody.value = memory.body;
  draftHappenedAt.value = memory.happenedAt ?? '';
  draftVisibility.value = memory.visibility;
  memoryError.value = null;
}

function cancelEditMemory(): void {
  editingMemoryId.value = '';
  memoryError.value = null;
}

async function saveMemory(memory: Memory): Promise<void> {
  if (memoryBusy.value) return;
  if (draftTitle.value.trim() === '' || draftBody.value.trim() === '') {
    memoryError.value = 'A title and a body are both required (FR-6.1).';
    return;
  }

  memoryBusy.value = true;
  memoryError.value = null;
  try {
    await memories.update(treeId.value, memory.id, {
      title: draftTitle.value.trim(),
      body: draftBody.value.trim(),
      happenedAt: draftHappenedAt.value,
      visibility: draftVisibility.value,
    });
    editingMemoryId.value = '';
  } catch (reason) {
    memoryError.value =
      reason instanceof ApiError
        ? reason.message
        : 'That memory could not be saved.';
  } finally {
    memoryBusy.value = false;
  }
}

async function deleteMemory(memory: Memory): Promise<void> {
  const confirmed = window.confirm(
    `Delete “${memory.title}”? This cannot be undone.`,
  );
  if (!confirmed) return;

  memoryBusy.value = true;
  memoryError.value = null;
  try {
    await memories.remove(treeId.value, memory.id);
  } catch (reason) {
    memoryError.value =
      reason instanceof ApiError
        ? reason.message
        : 'That memory could not be deleted.';
  } finally {
    memoryBusy.value = false;
  }
}

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
  editing.value = false;
  editingMemoryId.value = '';
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

      <!-- M4 — the person's own writes, offered where the API allows them
           (FR-4.4, FR-4.5, FR-4.6). -->
      <div
        v-if="mayEdit && !editing"
        class="writes"
      >
        <button
          type="button"
          class="writes__btn"
          @click="editing = true"
        >
          Edit this person
        </button>
        <button
          type="button"
          class="writes__btn writes__btn--danger"
          @click="onDeletePerson"
        >
          Delete
        </button>
      </div>

      <p
        v-if="actionError"
        class="writes__error"
        role="alert"
      >
        {{ actionError }}
      </p>

      <PersonForm
        v-if="editing && person !== undefined"
        class="writes__form"
        :tree-id="treeId"
        :person="person"
        @saved="onPersonSaved"
        @close="editing = false"
      />

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

            <img
              v-if="memory.photoUrl"
              class="memory__photo"
              :src="memory.photoUrl"
              alt=""
            />

            <p class="memory__meta">
              {{ memory.happenedAt ?? 'no date recorded' }}
            </p>
            <p class="memory__body">
              {{ memory.body }}
            </p>

            <!-- FR-6.4 — the author edits and deletes; an owner may delete a
                 shared memory but may never edit somebody else's words. -->
            <div
              v-if="mayEditMemory(memory) || mayDeleteMemory(memory)"
              class="memory__actions"
            >
              <button
                v-if="mayEditMemory(memory)"
                type="button"
                class="memory__btn"
                :disabled="memoryBusy"
                @click="startEditMemory(memory)"
              >
                Edit
              </button>
              <button
                v-if="mayDeleteMemory(memory)"
                type="button"
                class="memory__btn memory__btn--danger"
                :disabled="memoryBusy"
                @click="deleteMemory(memory)"
              >
                Delete
              </button>
            </div>

            <form
              v-if="editingMemoryId === memory.id"
              novalidate
              class="medit"
              @submit.prevent="saveMemory(memory)"
            >
              <label :for="`title-${memory.id}`">Title</label>
              <input
                :id="`title-${memory.id}`"
                v-model="draftTitle"
                type="text"
                required
              />

              <label :for="`body-${memory.id}`">Body</label>
              <textarea
                :id="`body-${memory.id}`"
                v-model="draftBody"
                rows="4"
                required
              />

              <label :for="`date-${memory.id}`">Occurred on</label>
              <input
                :id="`date-${memory.id}`"
                v-model="draftHappenedAt"
                type="date"
              />

              <label :for="`vis-${memory.id}`">Who can see it</label>
              <select
                :id="`vis-${memory.id}`"
                v-model="draftVisibility"
              >
                <option value="TREE">
                  Everyone in the tree
                </option>
                <option value="PRIVATE">
                  Only me
                </option>
              </select>

              <p
                v-if="memoryError"
                class="medit__error"
                role="alert"
              >
                {{ memoryError }}
              </p>

              <div class="medit__actions">
                <button
                  type="submit"
                  :disabled="memoryBusy"
                >
                  {{ memoryBusy ? 'Saving…' : 'Save changes' }}
                </button>
                <button
                  type="button"
                  class="medit__cancel"
                  :disabled="memoryBusy"
                  @click="cancelEditMemory"
                >
                  Cancel
                </button>
              </div>
            </form>
          </li>
        </ol>

        <p
          v-if="memoryError && editingMemoryId === ''"
          class="writes__error"
          role="alert"
        >
          {{ memoryError }}
        </p>
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

/* ---- M4: the writes this page owes its reader ---- */

.writes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.writes__btn {
  font: inherit;
  font-size: 0.85rem;
  padding: 0.3rem 0.85rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-control);
  background: var(--surface);
  cursor: pointer;
}

.writes__btn--danger {
  border-color: var(--danger);
  color: var(--danger);
}

.writes__error {
  margin: 0.75rem 0 0;
  padding: 0.5rem 0.75rem;
  border: var(--hairline) solid var(--border);
  border-left: 3px solid var(--danger);
  border-radius: var(--radius-card);
  background: var(--surface);
  font-size: 0.88rem;
}

.writes__form {
  margin-top: 0.75rem;
}

.memory__photo {
  display: block;
  max-width: 16rem;
  max-height: 12rem;
  margin-bottom: 0.5rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-card);
  object-fit: cover;
}

.memory__actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.memory__btn {
  font: inherit;
  font-size: 0.8rem;
  padding: 0.15rem 0.65rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-control);
  background: var(--surface);
  cursor: pointer;
}

.memory__btn--danger {
  border-color: var(--danger);
  color: var(--danger);
}

.medit {
  display: grid;
  gap: 0.35rem;
  margin-top: 0.75rem;
  padding: 0.85rem;
  border: var(--hairline) solid var(--border);
  border-left: 3px solid var(--primary);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.medit label {
  font-size: 0.85rem;
  font-weight: 600;
}

.medit input,
.medit textarea,
.medit select {
  padding: 0.4rem 0.5rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-control);
  font: inherit;
  background: var(--surface);
}

.medit__error {
  margin: 0;
  padding: 0.45rem 0.7rem;
  border: var(--hairline) solid var(--border);
  border-left: 3px solid var(--danger);
  border-radius: var(--radius-card);
  font-size: 0.85rem;
}

.medit__actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.medit__cancel {
  background: var(--surface);
  border: var(--hairline) solid var(--border);
}
</style>
