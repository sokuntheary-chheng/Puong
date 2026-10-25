<script setup lang="ts">
import type { AsyncState } from '../stores/asyncState';

/**
 * Renders one asynchronous value, whatever state it is in.
 *
 * The point of a wrapper rather than four `v-if`s in every view is that
 * loading, empty and error are then answered the same way on every screen,
 * and that adding a screen cannot quietly forget one of them — which is
 * exactly what the M1 checklist asks to be visible.
 *
 * Each state announces itself: `role="status"` for loading, because it is
 * an update rather than a problem, and `role="alert"` for an error, because
 * it is one. A screen reader user is told the fetch failed instead of
 * being left with a blank region.
 *
 * `empty` is passed in rather than derived, because "nothing to show" means
 * different things in different places: no trees, no people in this tree,
 * no memories for this person, no search results.
 */
const props = defineProps<{
  state: AsyncState<unknown>;
  empty?: boolean;
}>();

const emit = defineEmits<{
  retry: [];
}>();
</script>

<template>
  <!-- Idle: the request has not been made yet. Rendering nothing keeps the
       view from showing a spinner for data nobody has asked for. -->
  <div v-if="props.state.status === 'idle'" />

  <div
    v-else-if="props.state.status === 'loading'"
    class="async async--loading"
    role="status"
    aria-live="polite"
  >
    <slot name="loading">
      <span
        class="async__mark"
        aria-hidden="true"
      >◦</span>
      Loading…
    </slot>
  </div>

  <div
    v-else-if="props.state.status === 'error'"
    class="async async--error"
    role="alert"
  >
    <slot
      name="error"
      :error="props.state.error"
    >
      <p class="async__title">
        Something went wrong.
      </p>
      <p class="async__detail">
        {{ props.state.error }}
      </p>
      <button
        type="button"
        @click="emit('retry')"
      >
        Try again
      </button>
    </slot>
  </div>

  <slot v-else-if="!props.empty" />

  <div
    v-else
    class="async async--empty"
  >
    <slot name="empty">
      <p>There is nothing here yet.</p>
    </slot>
  </div>
</template>

<style scoped>
.async {
  padding: 1.25rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.async--loading {
  color: var(--text-muted);
}

.async--error {
  border-left: 3px solid var(--danger);
}

.async--empty {
  border-left: 3px solid var(--border);
  color: var(--text-muted);
}

.async__mark {
  display: inline-block;
  margin-right: 0.25rem;
}

.async__title {
  margin: 0 0 0.25rem;
  font-weight: 600;
  color: var(--danger);
}

.async__detail {
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
}
</style>
