<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  acceptSuccessor,
  ApiError,
  declineSuccessor,
  deleteTree,
  getSuccessor,
  listMemberships,
  listUsers,
  updateTree,
} from '../services/api';
import { useSessionStore } from '../stores/session';
import { useTreeStore } from '../stores/tree';
import type { Membership, SuccessorInfo, User } from '../types';

/**
 * The owner's side of a tree: rename it, delete it, and nominate who gets
 * it next (FR-2.4, FR-9.1).
 *
 * Three jobs in one panel because they are one subject — *this tree's own
 * existence and who is responsible for it* — and because all three are the
 * owner's alone. Splitting them into routes would mean three guards and
 * three forms for one role's business; keeping them together means the
 * succession controls are next to the member list they are chosen from,
 * which is where the question "who should have this?" is actually asked.
 *
 * The nominee's own answer (FR-9.2) is drawn here too, but only for the
 * account the nomination is *to*: `GET /successorships` is answered per
 * session, so a viewer looking at this panel sees neither the nomination
 * nor the button.
 */
const props = defineProps<{
  treeId: string;
}>();

const emit = defineEmits<{
  deleted: [];
}>();

const store = useTreeStore();
const session = useSessionStore();
const router = useRouter();

const isOwner = computed(() => store.myRole === 'OWNER');

/* ---- members, because a successor has to be one of them ---- */

const members = ref<Membership[]>([]);
const membersError = ref<string | null>(null);

/** A membership knows an id; this is what turns it back into a person. */
const accounts = ref<User[]>([]);

async function loadMembers(): Promise<void> {
  try {
    /* The accounts are fetched for every member, not only the owner: the
       transfer note below names the previous owner, and a former owner
       looking at the card is exactly the reader who needs a name rather
       than a `u1`. */
    const users = await listUsers();
    accounts.value = users;

    if (!isOwner.value) {
      members.value = [];
      membersError.value = null;
      return;
    }

    members.value = await listMemberships(props.treeId);
    membersError.value = null;
  } catch (reason) {
    membersError.value =
      reason instanceof ApiError ? reason.message : 'Members could not be loaded.';
  }
}

onMounted(() => {
  void loadMembers();
  void loadSuccessor();
});

watch(
  () => store.myRole,
  () => {
    void loadMembers();
  },
);

/* ---- the nomination ---- */

const successor = ref<SuccessorInfo | null>(null);
const successorError = ref<string | null>(null);

async function loadSuccessor(): Promise<void> {
  try {
    successor.value = await getSuccessor(props.treeId);
    successorError.value = null;
  } catch (reason) {
    successorError.value =
      reason instanceof ApiError
        ? reason.message
        : 'The succession record could not be loaded.';
  }
}

/**
 * Who may be nominated: an ACTIVE member who is a CONTRIBUTOR or an OWNER
 * (FR-9.1). A VIEWER cannot take a tree over, and the API refuses them
 * with a 400 — offering them here would be a form that only ever fails.
 */
const nominees = computed(() =>
  members.value.filter(
    (member) =>
      member.status === 'ACTIVE' &&
      (member.role === 'CONTRIBUTOR' || member.role === 'OWNER') &&
      member.userId !== session.currentUserId,
  ),
);

const chosenNominee = ref('');
const busy = ref(false);
const actionError = ref<string | null>(null);

function nameOf(userId: string): string {
  return accounts.value.find((user) => user.id === userId)?.displayName ?? userId;
}

async function nominate(): Promise<void> {
  if (busy.value || chosenNominee.value === '') return;
  actionError.value = null;
  busy.value = true;
  try {
    await updateTree(props.treeId, { successorId: chosenNominee.value });
    await loadSuccessor();
    chosenNominee.value = '';
    await store.open(props.treeId);
  } catch (reason) {
    actionError.value =
      reason instanceof ApiError
        ? reason.message
        : 'The nomination could not be made.';
  } finally {
    busy.value = false;
  }
}

async function withdraw(): Promise<void> {
  if (busy.value) return;
  actionError.value = null;
  busy.value = true;
  try {
    await updateTree(props.treeId, { successorId: null });
    await loadSuccessor();
    await store.open(props.treeId);
  } catch (reason) {
    actionError.value =
      reason instanceof ApiError
        ? reason.message
        : 'The nomination could not be withdrawn.';
  } finally {
    busy.value = false;
  }
}

/** FR-9.2 — only the nominee sees this, and only while it is pending. */
const iAmTheNominee = computed(
  () =>
    successor.value !== null &&
    successor.value.successorId !== null &&
    successor.value.successorId === session.currentUserId,
);

async function answer(accept: boolean): Promise<void> {
  if (busy.value) return;
  actionError.value = null;
  busy.value = true;
  try {
    successor.value = accept
      ? await acceptSuccessor(props.treeId)
      : await declineSuccessor(props.treeId);
    await store.open(props.treeId);
    await loadMembers();
  } catch (reason) {
    actionError.value =
      reason instanceof ApiError
        ? reason.message
        : 'That nomination could not be answered.';
  } finally {
    busy.value = false;
  }
}

/* ---- rename and delete ---- */

const name = ref(store.tree.data?.name ?? '');
const description = ref(store.tree.data?.description ?? '');

watch(
  () => store.tree.data,
  (tree) => {
    if (tree === null) return;
    name.value = tree.name;
    description.value = tree.description ?? '';
  },
  { immediate: true },
);

const savingName = ref(false);
const nameError = ref<string | null>(null);

async function rename(): Promise<void> {
  const value = name.value.trim();
  if (value.length < 2) {
    nameError.value = 'A family name needs at least 2 characters.';
    return;
  }
  if (value.length > 120) {
    nameError.value = 'A family name may be at most 120 characters.';
    return;
  }

  nameError.value = null;
  savingName.value = true;
  try {
    const tree = await updateTree(props.treeId, {
      name: value,
      description: description.value.trim(),
    });
    store.tree.data = tree;
  } catch (reason) {
    nameError.value =
      reason instanceof ApiError ? reason.message : 'The tree could not be renamed.';
  } finally {
    savingName.value = false;
  }
}

const deleting = ref(false);
const deleteError = ref<string | null>(null);

/**
 * Deleting asks twice, and says what goes with it.
 *
 * `confirm()` rather than a modal component: this is one irreversible
 * action on one screen, and the browser's own dialog cannot be dismissed by
 * a stray click, which is the property that matters here.
 */
async function onDelete(): Promise<void> {
  const tree = store.tree.data;
  const label = tree?.name ?? 'this tree';
  const people = store.people.data.length;
  const confirmed = window.confirm(
    `Delete “${label}” and everything in it — ${people} people, their links and every memory? This cannot be undone.`,
  );
  if (!confirmed) return;

  deleting.value = true;
  deleteError.value = null;
  try {
    await deleteTree(props.treeId);
    emit('deleted');
    await router.push({ name: 'home' });
  } catch (reason) {
    deleteError.value =
      reason instanceof ApiError ? reason.message : 'The tree could not be deleted.';
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <div class="settings">
    <!-- The nominee's own answer (FR-9.2) — drawn before the owner's
         controls, because for that account it is the only thing here. -->
    <section
      v-if="iAmTheNominee && successor"
      class="card"
      aria-labelledby="answer-title"
    >
      <h2
        id="answer-title"
        class="card__title"
      >
        You have been named successor
      </h2>
      <p class="card__note">
        {{ successor.ownerName }} nominated you on
        {{ successor.nominatedAt?.slice(0, 10) }}. Ownership moves only when
        you accept, and {{ successor.ownerName }} becomes a contributor.
      </p>
      <div class="actions">
        <button
          type="button"
          :disabled="busy"
          @click="answer(true)"
        >
          Accept ownership
        </button>
        <button
          type="button"
          class="btn--quiet"
          :disabled="busy"
          @click="answer(false)"
        >
          Decline
        </button>
      </div>
    </section>

    <template v-if="isOwner">
      <!-- FR-2.4 — rename -->
      <section
        class="card"
        aria-labelledby="rename-title"
      >
        <h2
          id="rename-title"
          class="card__title"
        >
          Tree settings
        </h2>

        <label for="settings-name">Name</label>
        <input
          id="settings-name"
          v-model="name"
          type="text"
          maxlength="120"
          minlength="2"
        />

        <label for="settings-description">Description</label>
        <textarea
          id="settings-description"
          v-model="description"
          rows="2"
          maxlength="2000"
        />

        <p
          v-if="nameError"
          class="card__error"
          role="alert"
        >
          {{ nameError }}
        </p>

        <div class="actions">
          <button
            type="button"
            :disabled="savingName"
            @click="rename"
          >
            {{ savingName ? 'Saving…' : 'Save details' }}
          </button>
        </div>
      </section>

      <!-- FR-9.1 — nominate -->
      <section
        class="card"
        aria-labelledby="successor-title"
      >
        <h2
          id="successor-title"
          class="card__title"
        >
          Successor
        </h2>

        <p
          v-if="successorError"
          class="card__error"
          role="alert"
        >
          {{ successorError }}
        </p>

        <p
          v-else-if="successor?.successorId"
          class="card__note"
        >
          <strong>{{ successor.successorName ?? successor.successorId }}</strong>
          has been nominated on {{ successor.nominatedAt?.slice(0, 10) }} —
          waiting for them to accept.
        </p>

        <p
          v-else
          class="card__note"
        >
          No nomination. Whoever takes this over should already be a member,
          so the transfer is a decision rather than an accident (FR-9.1).
        </p>

        <!-- FR-9.3 — the transfer that already happened is a fact about this
             tree, kept with its date. It is drawn for whoever can see the
             card, because "who owns this now, and since when" is the question
             the whole feature exists to answer after the fact. -->
        <p
          v-if="successor?.ownershipTransferredAt"
          class="card__transfer"
        >
          Ownership moved from {{ nameOf(successor.previousOwnerId ?? '') }}
          to {{ successor.ownerName }} on
          {{ successor.ownershipTransferredAt.slice(0, 10) }} — recorded with
          its date (FR-9.3).
        </p>

        <p
          v-if="membersError"
          class="card__error"
          role="alert"
        >
          {{ membersError }}
        </p>

        <div
          v-if="successor?.successorId === null || successor === null"
          class="nominate"
        >
          <label for="settings-nominee">Nominate</label>
          <select
            id="settings-nominee"
            v-model="chosenNominee"
          >
            <option value="">
              choose a member…
            </option>
            <option
              v-for="member in nominees"
              :key="member.userId"
              :value="member.userId"
            >
              {{ nameOf(member.userId) }} — {{ member.role.toLowerCase() }}
            </option>
          </select>
          <button
            type="button"
            :disabled="busy || chosenNominee === ''"
            @click="nominate"
          >
            Nominate
          </button>
        </div>

        <div
          v-else
          class="actions"
        >
          <button
            type="button"
            class="btn--quiet"
            :disabled="busy"
            @click="withdraw"
          >
            Withdraw the nomination
          </button>
        </div>

        <p
          v-if="actionError"
          class="card__error"
          role="alert"
        >
          {{ actionError }}
        </p>
      </section>

      <!-- FR-2.4 — delete -->
      <section
        class="card card--danger"
        aria-labelledby="delete-title"
      >
        <h2
          id="delete-title"
          class="card__title"
        >
          Delete this tree
        </h2>
        <p class="card__note">
          Removes the tree, its people, their links, every memory and every
          membership with it. There is no undo (FR-2.4).
        </p>

        <p
          v-if="deleteError"
          class="card__error"
          role="alert"
        >
          {{ deleteError }}
        </p>

        <div class="actions">
          <button
            type="button"
            class="btn--danger"
            :disabled="deleting"
            @click="onDelete"
          >
            {{ deleting ? 'Deleting…' : 'Delete tree' }}
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.settings {
  display: grid;
  gap: 0.75rem;
}

.card {
  display: grid;
  gap: 0.5rem;
  padding: 0.9rem 1rem 1rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.card--danger {
  border-left: 3px solid var(--danger);
}

.card__title {
  margin: 0;
  font-size: 1rem;
}

.card__note {
  margin: 0;
  font-size: 0.88rem;
  color: var(--text-muted);
}

.card__transfer {
  margin: 0;
  padding: 0.5rem 0.75rem;
  border: var(--hairline) solid var(--border);
  border-left: 3px solid var(--primary);
  border-radius: var(--radius-card);
  background: var(--primary-soft);
  font-size: 0.85rem;
}

.card__error {
  margin: 0;
  padding: 0.5rem 0.75rem;
  border: var(--hairline) solid var(--border);
  border-left: 3px solid var(--danger);
  border-radius: var(--radius-card);
  font-size: 0.85rem;
}

.card label {
  font-size: 0.85rem;
}

.card input,
.card textarea,
.card select {
  width: 100%;
  padding: 0.45rem 0.5rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-control);
  font: inherit;
  background: var(--surface);
  resize: vertical;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.nominate {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.6rem;
}

.nominate label {
  flex: 1 1 100%;
}

.nominate select {
  flex: 1 1 14rem;
  width: auto;
}

.actions button,
.nominate button {
  min-height: var(--control-height);
  padding: 0 1rem;
  border: var(--hairline) solid var(--primary);
  border-radius: var(--radius-control);
  background: var(--primary);
  color: var(--surface);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
}

.actions button:disabled,
.nominate button:disabled {
  opacity: 0.5;
  cursor: default;
}

.btn--quiet {
  background: var(--surface) !important;
  border: var(--hairline) solid var(--border) !important;
  color: var(--text) !important;
  font-weight: 400 !important;
}

.btn--danger {
  background: var(--danger) !important;
  border-color: var(--danger) !important;
}
</style>
