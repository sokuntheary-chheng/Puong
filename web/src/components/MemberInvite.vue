<script setup lang="ts">
import { ref } from 'vue';
import { ApiError, inviteMember } from '../services/api';
import type { Role } from '../types';

/**
 * FR-3.1 — invite a relative by email.
 *
 * An invitation, not a "add member" box: the API creates the membership
 * with `INVITED`, the tree does not appear in the invitee's list until they
 * accept (FR-3.5), and the invitation runs out after seven days (FR-3.4).
 * The address must already have an account — there is no mail provider in
 * this project, so an invitation to an unknown address would be an
 * invitation nobody could ever accept, and the API says so with a 404.
 *
 * The two roles the specification offers are the two that can be invited:
 * an OWNER is not invited, they are *made*, which is story 10's business.
 */
const props = defineProps<{
  treeId: string;
}>();

const emit = defineEmits<{
  invited: [];
}>();

const email = ref('');
const role = ref<Extract<Role, 'CONTRIBUTOR' | 'VIEWER'>>('VIEWER');
const saving = ref(false);
const error = ref<string | null>(null);
const done = ref(false);

async function onSubmit(): Promise<void> {
  if (saving.value) return;
  error.value = null;
  done.value = false;

  const address = email.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    error.value = 'Enter the address the relative uses to sign in.';
    return;
  }

  saving.value = true;
  try {
    await inviteMember(props.treeId, { email: address, role: role.value });
    done.value = true;
    email.value = '';
    emit('invited');
  } catch (reason) {
    error.value =
      reason instanceof ApiError
        ? reason.message
        : 'That invitation could not be sent. Please try again.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <form
    novalidate
    class="invite"
    @submit.prevent="onSubmit"
  >
    <h2 class="invite__title">
      Invite a relative
    </h2>

    <div class="invite__row">
      <span class="invite__field">
        <label for="invite-email">Email address</label>
        <input
          id="invite-email"
          v-model="email"
          type="email"
          name="email"
          autocomplete="email"
          placeholder="auntie@puong.dev"
          required
        />
      </span>

      <span class="invite__field invite__field--role">
        <label for="invite-role">Role</label>
        <select
          id="invite-role"
          v-model="role"
          name="role"
        >
          <option value="VIEWER">
            viewer — read only
          </option>
          <option value="CONTRIBUTOR">
            contributor — can add
          </option>
        </select>
      </span>

      <button
        type="submit"
        class="invite__send"
        :disabled="saving"
      >
        {{ saving ? 'Sending…' : 'Send invitation' }}
      </button>
    </div>

    <p class="invite__hint">
      They must already have an account (FR-3.1). The invitation expires
      seven days after it is sent (FR-3.4), and the tree joins their list
      only when they accept (FR-3.5).
    </p>

    <p
      v-if="error"
      class="invite__error"
      role="alert"
    >
      {{ error }}
    </p>

    <p
      v-if="done"
      class="invite__done"
      role="status"
    >
      Invitation sent — waiting for them to accept.
    </p>
  </form>
</template>

<style scoped>
.invite {
  display: grid;
  gap: 0.6rem;
  padding: 1rem 1.1rem 1.1rem;
  border: var(--hairline) solid var(--border);
  border-left: 3px solid var(--primary);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.invite__title {
  margin: 0;
  font-size: 1.02rem;
}

.invite__row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem;
}

.invite__field {
  flex: 1 1 14rem;
  min-width: 0;
  display: grid;
  gap: 0.25rem;
}

.invite__field--role {
  flex: 0 1 15rem;
}

.invite__field label {
  font-size: 0.85rem;
}

.invite__field input,
.invite__field select {
  width: 100%;
  padding: 0.45rem 0.5rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-control);
  font: inherit;
  background: var(--surface);
}

.invite__send {
  min-height: var(--control-height);
  padding: 0 1.1rem;
  border: var(--hairline) solid var(--primary);
  border-radius: var(--radius-control);
  background: var(--primary);
  color: var(--surface);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.invite__send:disabled {
  opacity: 0.5;
  cursor: default;
}

.invite__hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.invite__error,
.invite__done {
  margin: 0;
  padding: 0.5rem 0.75rem;
  border: var(--hairline) solid var(--border);
  border-left: 3px solid var(--danger);
  border-radius: var(--radius-card);
  font-size: 0.88rem;
}

.invite__done {
  border-left-color: var(--primary);
}
</style>
