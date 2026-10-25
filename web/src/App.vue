<script setup lang="ts">
import { onMounted, ref } from 'vue';
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
        >P</span>
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
        <span class="shell__who">{{ session.currentDisplayName }}</span>
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
  padding: 0.7rem 1.5rem;
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
  font-size: 0.95rem;
  font-weight: 700;
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
}

.shell__nav a:hover {
  color: var(--primary);
}

.shell__nav a[aria-current='page'] {
  font-weight: 600;
  color: var(--primary);
  text-decoration: none;
}

.shell__who {
  font-size: 0.85rem;
  color: var(--text-muted);
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
</style>
