<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { mockApi } from './services/mockApi';
import { useSessionStore } from './stores/session';

/**
 * Application shell: a header that identifies who you are and which tree
 * you are in, and the routed screen below it.
 *
 * The footer holds M1 scaffolding — an account switcher and a way to make
 * the next request fail. Both exist so that the permission matrix and the
 * error state can be demonstrated rather than described, and both go away
 * at M3 when there is a real session to sign in with.
 */
const session = useSessionStore();
const route = useRoute();

/**
 * The tree the screen below is inside, if any.
 *
 * The header's search leads to the tree's own search — there is no global
 * search to offer, so outside a tree the icon is simply not drawn rather
 * than drawn as something that does nothing.
 */
const treeId = computed(() => {
  const id = route.params.treeId;
  return typeof id === 'string' ? id : '';
});

/** The two letters the account badge wears. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter((part) => part.length > 0);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

onMounted(() => {
  void session.fetchUsers();
});

const failEndpoint = ref('people.list');
const armed = ref(false);

const failureTargets = [
  { value: 'trees.list', label: 'the tree list on the home screen' },
  { value: 'people.list', label: 'the people on a tree' },
  { value: 'memories.list', label: 'the memories on a person' },
  { value: 'search', label: 'a search' },
];

function armFailure(): void {
  mockApi.failNext(failEndpoint.value);
  armed.value = true;
}

function resetSeed(): void {
  mockApi.reset();
  armed.value = false;
}
</script>

<template>
  <div class="shell">
    <header class="shell__bar">
      <RouterLink
        to="/"
        class="shell__brand"
      >
        <span
          class="shell__mark"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect
              x="9"
              y="2.5"
              width="6"
              height="5"
              rx="1.5"
            />
            <rect
              x="2.5"
              y="16.5"
              width="6"
              height="5"
              rx="1.5"
            />
            <rect
              x="15.5"
              y="16.5"
              width="6"
              height="5"
              rx="1.5"
            />
            <path d="M12 7.5V13M5.5 13h13M5.5 13v3.5M18.5 13v3.5" />
          </svg>
        </span>
        <span class="shell__names">
          <span class="shell__name">Puong</span>
          <span class="shell__tag">Your family’s story, connected.</span>
        </span>
      </RouterLink>
      <nav
        class="shell__nav"
        aria-label="Main"
      >
        <RouterLink to="/">
          My trees
        </RouterLink>
        <RouterLink to="/login">
          Log in
        </RouterLink>
        <RouterLink
          v-if="treeId !== ''"
          class="shell__icon"
          :to="{ name: 'search', params: { treeId } }"
          aria-label="Search this tree"
          title="Search this tree"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <circle
              cx="11"
              cy="11"
              r="7"
            />
            <path d="m16.5 16.5 4 4" />
          </svg>
        </RouterLink>
        <span
          class="shell__who"
          role="img"
          :aria-label="`Signed in as ${session.currentDisplayName}`"
          :title="session.currentDisplayName"
        >{{ initialsOf(session.currentDisplayName) }}</span>
      </nav>
    </header>

    <main class="shell__main">
      <RouterView />
    </main>

    <footer class="shell__foot">
      <details>
        <summary>M1 demo controls</summary>

        <div class="controls">
          <fieldset>
            <legend>Signed in as</legend>
            <label
              v-for="user in session.users.data"
              :key="user.id"
              class="choice"
            >
              <input
                type="radio"
                name="demo-user"
                :value="user.id"
                :checked="session.currentUserId === user.id"
                @change="session.switchTo(user.id)"
              />
              <span>{{ user.displayName }} <small>{{ user.email }}</small></span>
            </label>
          </fieldset>

          <fieldset>
            <legend>Failure state</legend>
            <label for="fail-target">Make the next request fail</label>
            <select
              id="fail-target"
              v-model="failEndpoint"
            >
              <option
                v-for="target in failureTargets"
                :key="target.value"
                :value="target.value"
              >
                {{ target.label }}
              </option>
            </select>
            <button
              type="button"
              @click="armFailure"
            >
              Arm
            </button>
            <button
              type="button"
              class="controls__secondary"
              @click="resetSeed"
            >
              Reset the data
            </button>
            <p
              v-if="armed"
              class="controls__note"
              role="status"
            >
              Armed — open that screen and it will fail once, then recover.
            </p>
          </fieldset>
        </div>
      </details>
    </footer>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.shell__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  /* Lands the bar at ~66px with the 34px mark in it: the reference's
     64–72px, and enough room for the name and its tagline to sit
     comfortably rather than being squeezed. */
  padding: 0.9rem 1.5rem;
  border-bottom: var(--hairline) solid var(--border);
  background: var(--surface);
}

.shell__brand {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  color: var(--text);
}

.shell__brand:hover {
  text-decoration: none;
}

.shell__mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-control);
  background: var(--primary);
  color: var(--surface);
}

.shell__names {
  display: grid;
  line-height: 1.15;
}

.shell__name {
  font-size: 1.1rem;
  font-weight: 700;
}

.shell__tag {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.shell__nav {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 0.95rem;
}

.shell__nav a {
  color: var(--text);
  /* "My trees" is one label, not two words that may fall apart. */
  white-space: nowrap;
}

.shell__nav a:hover {
  color: var(--primary);
}

.shell__nav a[aria-current='page'] {
  font-weight: 600;
  color: var(--primary);
  text-decoration: none;
}

/* The header's search — only drawn inside a tree, where it leads to that
   tree's real search route rather than to nowhere. */
.shell__icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-control);
  color: var(--text);
  transition:
    color 0.15s ease,
    background-color 0.15s ease;
}

.shell__icon:hover {
  background: var(--primary-soft);
  color: var(--primary);
  text-decoration: none;
}

/* The account badge: a disc with initials on the reference's sand, not a
   control — there is nothing to open until M3 brings a real session. */
.shell__who {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--sand);
  color: var(--text);
  font-size: 0.72rem;
  font-weight: 700;
}

.shell__main {
  flex: 1;
  padding: 1.75rem 1.5rem 3rem;
  max-width: 72rem;
  width: 100%;
  margin: 0 auto;
}

.shell__foot {
  border-top: var(--hairline) solid var(--border);
  background: var(--surface);
  padding: 0.5rem 1.5rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.controls {
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
  padding: 0.75rem 0 0.25rem;
}

.controls fieldset {
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-card);
  padding: 0.6rem 0.85rem 0.85rem;
  display: grid;
  gap: 0.3rem;
  min-width: 15rem;
}

.controls legend {
  padding: 0 0.3rem;
  font-weight: 600;
}

.controls select {
  font: inherit;
  padding: 0.25rem;
}

.controls button {
  font: inherit;
  margin-top: 0.35rem;
  justify-self: start;
  padding: 0 1rem;
}

.controls__secondary {
  background: var(--surface);
  border: var(--hairline) solid var(--border);
}

.controls__note {
  margin: 0.35rem 0 0;
  font-style: italic;
}

.choice {
  display: flex;
  gap: 0.4rem;
  align-items: baseline;
  font-weight: 400;
}

.choice small {
  color: var(--text-muted);
}

/* ---- narrow screens: one compact line of brand, one line of links ---- */
@media (max-width: 640px) {
  .shell__bar {
    gap: 0.6rem;
    padding: 0.7rem 1rem;
  }

  /* The tagline is a desktop flourish; on a phone the navigation needs
     the room more than it does. */
  .shell__tag {
    display: none;
  }

  .shell__nav {
    gap: 0.7rem;
    font-size: 0.85rem;
  }

  .shell__main {
    padding: 1.1rem 1rem 2.5rem;
  }

  .shell__foot {
    padding: 0.5rem 1rem;
  }
}
</style>
