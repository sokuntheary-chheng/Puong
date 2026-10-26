<script setup lang="ts">
import { computed, onMounted } from 'vue';
import AsyncState from '../components/AsyncState.vue';
import { useTreesStore } from '../stores/trees';

/**
 * / — Home, the trees the signed-in member belongs to (FR-1.2, FR-1.3).
 *
 * The store is loaded once on mount. `fetch` is idempotent, so the retry
 * offered by AsyncState simply runs it again — and it fetches the list
 * first, the totals second, so a failed list never leaves the counts
 * totalling somebody else's trees.
 *
 * The header carries a primary button, as the reference does, but M1 has
 * no create-tree flow behind it — mockApi can list and read trees, not
 * make one — so it is drawn disabled and says why, rather than sitting
 * there looking ready to work. The counts row below is drawn from the same
 * three states every other screen uses, so a total that is not known yet
 * shows a dash rather than a 0 that looks like an answer.
 */
const store = useTreesStore();

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

      <!-- The reference puts a primary action here. M1 has no create-tree
           flow behind it (mockApi can list and read trees, not make one),
           so the button is drawn doing exactly what it does — nothing —
           and says so, rather than sitting there looking ready to work. -->
      <div class="head__actions">
        <button
          type="button"
          class="head__action"
          disabled
          aria-describedby="add-family-note"
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
        <span
          id="add-family-note"
          class="head__note"
        >Not in M1 yet</span>
      </div>
    </header>

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
  cursor: not-allowed;
}

.head__note {
  font-size: 0.75rem;
  font-style: italic;
  color: var(--text-muted);
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
