<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { demo } from './services/api';
import { useSessionStore } from './stores/session';

/**
 * Application shell: a header that identifies who you are and which tree
 * you are in, and the routed screen below it.
 *
 * The M1 scaffolding is gone — the account switcher was a stand-in for a
 * session, and there is a session now. What is left in the footer is one
 * control the M1 checklist still wants a use for: making a request fail so
 * the error state can be seen on demand. It stops the next call in the
 * browser and says so, rather than pretending the server broke.
 */
const session = useSessionStore();
const route = useRoute();
const router = useRouter();

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

/**
 * The session is normally resolved by the router guard before anything
 * renders; asking again here is free (the call is memoised) and covers the
 * case of a hard reload that somehow reaches a view first.
 */
onMounted(() => {
  void session.restore();
});

/**
 * The session can end while a screen is open — an expired cookie, a logout
 * in another tab, a `401` from any request. The guard only runs on
 * navigation, so without this the header would keep naming somebody the
 * server no longer recognises and the screen would keep offering their
 * controls.
 *
 * `false → true` is not watched: arriving signed out is the normal start of
 * a visit, and bouncing that through `/login` would be the guard's job done
 * twice.
 */
watch(
  () => session.isSignedIn,
  (signedIn) => {
    if (signedIn) return;
    if (route.meta.public === true) return;
    void router.push({ name: 'login', query: { next: route.fullPath } });
  },
);

async function onLogout(): Promise<void> {
  await session.logout();
  /* The watcher above sends us onward; there is no point asking for a page
     the next account may not be allowed to see. */
  if (route.name !== 'login') {
    await router.push({ name: 'login' });
  }
}

const failEndpoint = ref('people.list');
const armed = ref(false);

const failureTargets = [
  { value: 'trees.list', label: 'the tree list on the home screen' },
  { value: 'people.list', label: 'the people on a tree' },
  { value: 'memories.list', label: 'the memories on a person' },
  { value: 'search', label: 'a search' },
];

function armFailure(): void {
  demo.failNext(failEndpoint.value);
  armed.value = true;
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
        <RouterLink
          v-if="!session.isSignedIn"
          to="/login"
        >
          Log in
        </RouterLink>
        <button
          v-else
          type="button"
          class="shell__out"
          @click="onLogout"
        >
          Log out
        </button>
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
          :aria-label="
            session.isSignedIn
              ? `Signed in as ${session.currentDisplayName}`
              : 'Not signed in'
          "
          :title="
            session.isSignedIn
              ? session.currentDisplayName
              : 'Not signed in — log in to open a tree'
          "
        >{{ session.isSignedIn ? initialsOf(session.currentDisplayName) : '?' }}</span>
      </nav>
    </header>

    <main class="shell__main">
      <RouterView />
    </main>

    <footer class="shell__foot">
      <details>
        <summary>Demo controls</summary>

        <div class="controls">
          <fieldset>
            <legend>Failure state</legend>
            <label for="fail-target">Stop the next request in the browser</label>
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
            <p
              v-if="armed"
              class="controls__note"
              role="status"
            >
              Armed — open that screen and it will fail once, then recover.
              Nothing is sent; the message says the request was stopped here.
            </p>
          </fieldset>

          <fieldset>
            <legend>Session</legend>
            <p class="controls__note">
              Signed in as
              <strong>{{ session.currentDisplayName }}</strong>.
              The session itself is an <code>httpOnly</code> cookie — view
              it in the network panel and there is no token to read in any
              response body.
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

/* The sign-out control sits in the navigation row, so it wears a link's
   typography while being a button: it does something rather than go
   somewhere, and a button is what a keyboard and a screen reader expect. */
.shell__out {
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: var(--text);
  white-space: nowrap;
  cursor: pointer;
}

.shell__out:hover {
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

.controls__note {
  margin: 0.35rem 0 0;
  font-style: italic;
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
