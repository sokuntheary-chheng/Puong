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
        Puong
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
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid var(--puong-rule, #d8d2c6);
  background: var(--puong-surface, #fffdf8);
}

.shell__brand {
  font-weight: 700;
  letter-spacing: 0.01em;
}

.shell__nav {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  font-size: 0.95rem;
}

.shell__nav a[aria-current='page'] {
  font-weight: 600;
  text-decoration: none;
}

.shell__who {
  font-size: 0.85rem;
  color: var(--puong-muted, #6b6257);
}

.shell__main {
  flex: 1;
  padding: 1.5rem 1.25rem 3rem;
  max-width: 68rem;
  width: 100%;
  margin: 0 auto;
}

.shell__foot {
  border-top: 1px solid var(--puong-rule, #d8d2c6);
  padding: 0.5rem 1.25rem;
  font-size: 0.85rem;
  color: var(--puong-muted, #6b6257);
}

.controls {
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
  padding: 0.75rem 0 0.25rem;
}

.controls fieldset {
  border: 1px solid var(--puong-rule, #d8d2c6);
  border-radius: 6px;
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
  padding: 0.25rem 0.6rem;
}

.controls__secondary {
  background: none;
  border: 1px solid var(--puong-rule, #d8d2c6);
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
  color: var(--puong-muted, #6b6257);
}
</style>
