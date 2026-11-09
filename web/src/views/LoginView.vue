<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '../services/api';
import { useSessionStore } from '../stores/session';

/**
 * /login — the only public screen in the application, and the only way in.
 *
 * Two things happen here and nowhere else in the browser: an account is
 * created, and a session is started. Both end the same way — the API sets
 * an `httpOnly`, `SameSite=Strict` cookie and answers with the account —
 * and then the router puts you back where you were going (`?next=`), because
 * arriving at a login form is a detour, not a destination.
 *
 * The password is sent once, over the wire, and is never stored by this
 * page: there is nothing in `localStorage`, nothing in a Vuex/Pinia field
 * that outlives the tab, and no token to read. That is the storage choice
 * MILESTONES.md defends.
 */
const session = useSessionStore();
const route = useRoute();
const router = useRouter();

const mode = ref<'login' | 'register'>('login');
const email = ref('');
const password = ref('');
const displayName = ref('');

/** The server's answer, or null while everything is fine. */
const error = ref<string | null>(null);
const busy = ref(false);

const isRegister = computed(() => mode.value === 'register');

/** Switching modes keeps what has been typed — an email is an email. */
function switchMode(next: 'login' | 'register'): void {
  mode.value = next;
  error.value = null;
}

/**
 * Where to go once signed in: the page that sent us here, or the front
 * door. Same rule as the router guard — a path inside this app only.
 */
function destination(): string {
  const next = route.query.next;
  if (typeof next !== 'string') return '/';
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

async function onSubmit(): Promise<void> {
  if (busy.value) return;
  error.value = null;
  busy.value = true;

  try {
    if (isRegister.value) {
      await session.register({
        email: email.value.trim(),
        displayName: displayName.value.trim(),
        password: password.value,
      });
    } else {
      await session.login({
        email: email.value.trim(),
        password: password.value,
      });
    }
    await router.replace(destination());
  } catch (reason) {
    error.value =
      reason instanceof ApiError
        ? reason.message
        : 'Something went wrong. Please try again.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section>
    <h1>{{ isRegister ? 'Create an account' : 'Log in' }}</h1>
    <p class="auth__intro">
      {{
        isRegister
          ? 'One account for your family archive. You will own every tree you create.'
          : 'The seed accounts all use the password Passw0rd!'
      }}
    </p>

    <div
      class="auth__modes"
      role="group"
      aria-label="Have you an account?"
    >
      <button
        type="button"
        :class="{ 'is-on': !isRegister }"
        :aria-pressed="!isRegister"
        @click="switchMode('login')"
      >
        Log in
      </button>
      <button
        type="button"
        :class="{ 'is-on': isRegister }"
        :aria-pressed="isRegister"
        @click="switchMode('register')"
      >
        Create an account
      </button>
    </div>

    <form
      class="auth"
      novalidate
      @submit.prevent="onSubmit"
    >
      <label
        v-if="isRegister"
        for="register-name"
      >Display name</label>
      <input
        v-if="isRegister"
        id="register-name"
        v-model="displayName"
        type="text"
        name="displayName"
        autocomplete="name"
        maxlength="80"
        required
      />

      <label for="login-email">Email</label>
      <input
        id="login-email"
        v-model="email"
        type="email"
        name="email"
        autocomplete="username"
        required
      />

      <label for="login-password">Password</label>
      <input
        id="login-password"
        v-model="password"
        type="password"
        name="password"
        :autocomplete="isRegister ? 'new-password' : 'current-password'"
        minlength="8"
        required
      />

      <button
        type="submit"
        :disabled="busy"
      >
        {{ busy ? 'Working…' : isRegister ? 'Create account' : 'Log in' }}
      </button>
    </form>

    <p
      v-if="error"
      class="auth__error"
      role="alert"
    >
      {{ error }}
    </p>

    <p
      v-if="session.error && !error"
      class="auth__note"
      role="status"
    >
      {{ session.error }}
    </p>

    <p class="auth__note">
      {{
        isRegister
          ? 'Already have an account? Choose “Log in” above.'
          : 'No account yet? Choose “Create an account” above — a new account starts with no trees, and can make its first one straight away.'
      }}
    </p>
  </section>
</template>

<style scoped>
.auth__intro {
  margin-bottom: 0.9rem;
  font-size: 0.95rem;
  color: var(--text-muted);
}

.auth__modes {
  display: inline-flex;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
  padding: 0.2rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-control);
  background: var(--surface);
}

.auth__modes button {
  padding: 0.3rem 0.85rem;
  border: none;
  border-radius: var(--radius-control);
  background: none;
  font: inherit;
  font-size: 0.9rem;
  color: var(--text-muted);
  cursor: pointer;
}

.auth__modes button.is-on {
  background: var(--primary);
  color: var(--surface);
  font-weight: 600;
}

.auth {
  display: grid;
  gap: 0.35rem;
  max-width: 22rem;
}

.auth label {
  margin-top: 0.75rem;
  font-size: 0.9rem;
}

.auth input {
  padding: 0.45rem 0.5rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-control);
}

.auth button {
  margin-top: 1rem;
  justify-self: start;
}

.auth button:disabled {
  opacity: 0.6;
  cursor: wait;
}

/* The one message that must be impossible to miss: it is why the form did
   not work. `role="alert"` in the template, danger treatment here. */
.auth__error {
  margin-top: 1rem;
  padding: 0.55rem 0.75rem;
  border: var(--hairline) solid var(--border);
  border-left: 3px solid var(--danger);
  border-radius: var(--radius-card);
  background: var(--surface);
  font-size: 0.9rem;
  max-width: 32rem;
}

.auth__note {
  margin-top: 1rem;
  font-size: 0.9rem;
  color: var(--text-muted);
  max-width: 32rem;
}
</style>
