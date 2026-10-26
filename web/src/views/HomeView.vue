<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AsyncState from '../components/AsyncState.vue';
import { ApiError } from '../services/api';
import { useTreesStore } from '../stores/trees';

/**
 * / — Home, the trees the signed-in member belongs to (FR-1.2, FR-1.3).
 *
 * The store is loaded once on mount. `fetch` is idempotent, so the retry
 * offered by AsyncState simply runs it again — and it fetches the list
 * first, the totals second, so a failed list never leaves the counts
 * totalling somebody else's trees.
 *
 * **Creating a tree (FR-2.1) lives here too**, behind the header's primary
 * button. It has to: every account starts with no memberships, so without a
 * way to make the first tree, registering would land somebody on an empty
 * screen with nothing to do about it. The form opens in place rather than
 * on a route of its own — it is three fields and a submit, and a route for
 * it would need its own guard, its own loading state and its own error
 * handling for no gain in clarity.
 *
 * The counts row below is drawn from the same three states every other
 * screen uses, so a total that is not known yet shows a dash rather than a
 * 0 that looks like an answer.
 */
const store = useTreesStore();
const router = useRouter();

onMounted(() => {
  void store.fetch();
});

const isEmpty = computed(() => store.trees.data.length === 0);

/** Only honest once the list itself has landed. */
const countsReady = computed(() => store.counts.status === 'ready');

function statValue(ready: boolean, count: number): string {
  return ready ? String(count) : '–';
}

/** The tinted circle each tree card wears. */
function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

/* ---- create a tree ---- */

const creating = ref(false);
const name = ref('');
const description = ref('');
const createError = ref<string | null>(null);
const saving = ref(false);

function openForm(): void {
  creating.value = true;
  createError.value = null;
}

function closeForm(): void {
  creating.value = false;
  createError.value = null;
  name.value = '';
  description.value = '';
}

async function onCreate(): Promise<void> {
  if (saving.value) return;
  createError.value = null;
  saving.value = true;

  try {
    const tree = await store.create({
      name: name.value.trim(),
      ...(description.value.trim() === '' ? {} : { description: description.value.trim() }),
    });
    closeForm();
    /* Straight into the new tree: making a family and then being shown a
       list containing it would be one screen too many. */
    await router.push({ name: 'tree', params: { treeId: tree.id } });
  } catch (reason) {
    createError.value =
      reason instanceof ApiError
        ? reason.message
        : 'The tree could not be created. Please try again.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section>
    <header class="head">
      <div class="head__text">
        <h1>My trees</h1>
        <p class="head__tagline">
          Every tree you belong to, in one place.
        </p>
      </div>

      <div class="head__actions">
        <button
          v-if="!creating"
          type="button"
          class="head__action"
          @click="openForm"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle
              cx="9"
              cy="7"
              r="4"
            />
            <path d="M19 8v6M22 11h-6" />
          </svg>
          Add a family
        </button>
      </div>
    </header>

    <!-- FR-2.1 — create a tree. Opened in place: three fields, and the
         owner is whoever the cookie says is asking (the API reads it from
         the session, so there is no "owned by" field to fill in). -->
    <form
      v-if="creating"
      class="create"
      novalidate
      @submit.prevent="onCreate"
    >
      <h2 class="create__title">
        Add a family
      </h2>

      <label for="tree-name">Family or tree name</label>
      <input
        id="tree-name"
        v-model="name"
        type="text"
        name="name"
        minlength="2"
        maxlength="120"
        required
        autofocus
      />

      <label for="tree-description">Description <span class="create__optional">(optional)</span></label>
      <textarea
        id="tree-description"
        v-model="description"
        name="description"
        rows="2"
        maxlength="2000"
      />

      <p
        v-if="createError"
        class="create__error"
        role="alert"
      >
        {{ createError }}
      </p>

      <div class="create__actions">
        <button
          type="submit"
          :disabled="saving"
        >
          {{ saving ? 'Creating…' : 'Create tree' }}
        </button>
        <button
          type="button"
          class="create__cancel"
          :disabled="saving"
          @click="closeForm"
        >
          Cancel
        </button>
      </div>
    </form>

    <AsyncState
      :state="store.trees"
      :empty="isEmpty"
      @retry="store.fetch()"
    >
      <template #empty>
        <p>
          You have no trees yet — and nobody has invited you to theirs.
          Use <strong>Add a family</strong> above to start one: you will
          become its owner and can invite the rest of the family from
          there.
        </p>
      </template>

      <dl class="stats">
        <div class="stat">
          <dt class="stat__label">
            Trees
          </dt>
          <dd class="stat__value">
            {{ store.trees.data.length }}
          </dd>
        </div>
        <div class="stat">
          <dt class="stat__label">
            People
          </dt>
          <dd class="stat__value">
            {{ statValue(countsReady, store.counts.data.people) }}
          </dd>
        </div>
        <div class="stat">
          <dt class="stat__label">
            Memories
          </dt>
          <dd class="stat__value">
            {{ statValue(countsReady, store.counts.data.memories) }}
          </dd>
        </div>
      </dl>

      <!-- The list itself is fine, only the totals are not: a compact line
           rather than the full error box, which would suggest the trees
           below had failed too. -->
      <p
        v-if="store.counts.status === 'error'"
        class="counts"
        role="alert"
      >
        The totals could not be loaded.
        <span class="counts__detail">{{ store.counts.error }}</span>
        <button
          type="button"
          class="counts__retry"
          @click="store.fetch()"
        >
          Try again
        </button>
      </p>

      <ul class="trees">
        <li
          v-for="tree in store.trees.data"
          :key="tree.id"
          class="trees__item"
        >
          <RouterLink
            class="tree"
            :to="`/trees/${tree.id}`"
          >
            <span
              class="tree__mark"
              aria-hidden="true"
            >{{ initial(tree.name) }}</span>
            <span class="tree__text">
              <span class="tree__name">{{ tree.name }}</span>
              <span class="tree__note">{{ tree.description }}</span>
            </span>
            <span
              class="tree__arrow"
              aria-hidden="true"
            >→</span>
          </RouterLink>
        </li>
      </ul>
    </AsyncState>
  </section>
</template>

<style scoped>
/* ---- the header: what this screen is ---- */

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.1rem;
}

.head__text {
  min-width: 0;
}

.head h1 {
  margin-bottom: 0.15rem;
}

.head__tagline {
  font-size: 0.95rem;
  color: var(--text-muted);
}

.head__actions {
  display: grid;
  justify-items: end;
  gap: 0.3rem;
}

.head__action {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: var(--control-height);
  padding: 0 1.1rem;
  border: var(--hairline) solid var(--primary);
  border-radius: var(--radius-control);
  background: var(--primary);
  color: var(--surface);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

/* ---- create a tree: three fields, opened in place ---- */

.create {
  display: grid;
  gap: 0.35rem;
  max-width: 34rem;
  margin-bottom: 1.25rem;
  padding: 1rem 1.1rem 1.1rem;
  border: var(--hairline) solid var(--border);
  border-left: 3px solid var(--primary);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.create__title {
  margin: 0 0 0.35rem;
  font-size: 1.05rem;
}

.create label {
  margin-top: 0.5rem;
  font-size: 0.9rem;
}

.create__optional {
  color: var(--text-muted);
  font-weight: 400;
}

.create input,
.create textarea {
  padding: 0.45rem 0.5rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-control);
  font: inherit;
  resize: vertical;
}

.create__error {
  margin: 0.6rem 0 0;
  padding: 0.5rem 0.75rem;
  border: var(--hairline) solid var(--border);
  border-left: 3px solid var(--danger);
  border-radius: var(--radius-card);
  font-size: 0.88rem;
}

.create__actions {
  display: flex;
  gap: 0.6rem;
  margin-top: 0.75rem;
}

.create__cancel {
  background: var(--surface);
  border: var(--hairline) solid var(--border);
}

/* ---- three counts, the tree view's own cards ---- */

.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 0 0 1.25rem;
}

.stat {
  display: flex;
  flex-direction: column;
  /* The label wraps at 390px but not at 1280px. Pushing the value to the
     bottom of each card keeps the three numbers on one line whichever of
     the two is showing. */
  justify-content: space-between;
  padding: 0.6rem 0.85rem 0.7rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.stat__label {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.stat__value {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.25;
}

/* ---- the totals failing on their own ---- */

/* A sentence with a button at the end of it, not a box: the trees below are
   fine, and this must not read like they are not. Flows as text, so it
   wraps where the sentence does rather than stacking its parts. */
.counts {
  margin: -0.6rem 0 1.1rem;
  padding: 0.5rem 0.75rem;
  border: var(--hairline) solid var(--border);
  border-left: 3px solid var(--danger);
  border-radius: var(--radius-card);
  background: var(--surface);
  font-size: 0.85rem;
}

.counts__detail {
  color: var(--text-muted);
  font-family: monospace;
  font-size: 0.8rem;
}

.counts__retry {
  display: inline-flex;
  align-items: center;
  min-height: auto;
  margin-left: 0.35rem;
  padding: 0.15rem 0.7rem;
  font-size: 0.82rem;
  vertical-align: baseline;
}

/* ---- one card per tree, the reference's card treatment ---- */

.trees {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 30rem), 1fr));
  gap: 0.75rem;
}

.trees__item {
  display: flex;
  min-width: 0;
}

.tree {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  flex: 1;
  min-width: 0;
  padding: 0.9rem 1rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
  color: var(--text);
  text-decoration: none;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.tree:hover {
  border-color: var(--primary);
  background: var(--primary-soft);
  text-decoration: none;
}

.tree__mark {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary);
  font-size: 0.9rem;
  font-weight: 700;
}

.tree:hover .tree__mark {
  background: var(--surface);
}

.tree__text {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}

.tree__name {
  font-weight: 600;
}

.tree__note {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.tree__arrow {
  margin-left: auto;
  color: var(--primary);
}
</style>
