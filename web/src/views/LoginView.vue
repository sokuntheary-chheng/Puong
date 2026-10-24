<script setup lang="ts">
import { ref } from 'vue';

/**
 * /login — M1 item 3.
 *
 * The form is inert: authentication, password hashing and the session are M3
 * (FR-3.1–FR-3.6). What exists here is the screen and its fields, so that the
 * routed application has somewhere to return to once the session exists.
 */
const email = ref('');
const password = ref('');
const submitted = ref(false);

function onSubmit(): void {
  /* M3 replaces this with the auth call; it exists so the form is
     submittable and the control flow is visible in the demo. */
  submitted.value = true;
}
</script>

<template>
  <section>
    <h1>Log in</h1>

    <form
      class="auth"
      @submit.prevent="onSubmit"
    >
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
        autocomplete="current-password"
        required
      />

      <button type="submit">
        Log in
      </button>
    </form>

    <p
      v-if="submitted"
      class="auth__note"
      role="status"
    >
      Authentication arrives with M3 — this screen only collects the fields.
    </p>
  </section>
</template>

<style scoped>
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
  border: 1px solid var(--puong-rule, #d8d2c6);
  border-radius: 4px;
}

.auth button {
  margin-top: 1rem;
  padding: 0.5rem 0.75rem;
  justify-self: start;
}

.auth__note {
  margin-top: 1rem;
  font-size: 0.9rem;
  color: var(--puong-muted, #6b6257);
}
</style>
