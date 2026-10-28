<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ApiError } from '../services/api';
import { useTreeStore } from '../stores/tree';
import type { RelationType } from '../types';

/**
 * The relation form and the links already recorded — story 5 (FR-5.1) and
 * FR-5.5's delete.
 *
 * Both live together because they are the same question asked twice: "how
 * is this person related to the others?" A form with no list above it
 * forces the reader to remember what they already linked, and a list with
 * no form makes removing a link a dead end — you unlink by creating the
 * correct link instead.
 *
 * `PARENT` reads "`from` is the parent of `to`", which is the one direction
 * the four types disagree about, so the labels change with the type rather
 * than leaving the reader to work it out from a field called "from".
 */
const props = defineProps<{
  treeId: string;
  /** Whose links these are; the form starts with them as the source. */
  personId: string;
}>();

const emit = defineEmits<{
  saved: [];
  close: [];
}>();

const store = useTreeStore();

const RELATION_TYPES: RelationType[] = ['PARENT', 'SPOUSE', 'SIBLING', 'FRIEND'];

/** How each type reads in a sentence, and which end is which. */
const WORDING: Record<RelationType, { from: string; to: string }> = {
  PARENT: { from: 'Parent', to: 'Child' },
  SPOUSE: { from: 'First spouse', to: 'Second spouse' },
  SIBLING: { from: 'Sibling', to: 'Sibling' },
  FRIEND: { from: 'Friend', to: 'Friend' },
};

const source = ref(props.personId);
const type = ref<RelationType>('PARENT');
const target = ref('');

watch(
  () => props.personId,
  (next) => {
    source.value = next;
    target.value = '';
  },
);

const others = computed(() =>
  store.people.data.filter((person) => person.id !== source.value),
);

/** The links that start at — or end at — the person this form is about. */
const links = computed(() =>
  store.relations.data.filter(
    (relation) => relation.fromId === source.value || relation.toId === source.value,
  ),
);

function nameOf(personId: string): string {
  return store.find(personId)?.fullName ?? personId;
}

const saving = ref(false);
const error = ref<string | null>(null);

async function onSubmit(): Promise<void> {
  if (saving.value) return;
  error.value = null;

  if (target.value === '') {
    error.value = 'Choose the person to link to.';
    return;
  }

  saving.value = true;
  try {
    await store.link({
      fromId: source.value,
      toId: target.value,
      type: type.value,
    });
    target.value = '';
    emit('saved');
  } catch (reason) {
    /* 400 self-link, 404 somebody in another tree, 409 duplicate or cycle —
       each arrives as its own sentence, which is the whole reason the API
       explains them rather than answering a bare code. */
    error.value =
      reason instanceof ApiError
        ? reason.message
        : 'That link could not be created. Please try again.';
  } finally {
    saving.value = false;
  }
}

async function onUnlink(relationId: string): Promise<void> {
  if (saving.value) return;
  error.value = null;
  saving.value = true;
  try {
    await store.unlink(relationId);
  } catch (reason) {
    error.value =
      reason instanceof ApiError
        ? reason.message
        : 'That link could not be removed. Please try again.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="rpanel">
    <form
      novalidate
      class="rform"
      @submit.prevent="onSubmit"
    >
      <h2 class="rform__title">
        Link a relative
      </h2>

      <div class="rform__row">
        <span class="rform__field">
          <label for="rel-source">Person</label>
          <select
            id="rel-source"
            v-model="source"
            name="fromId"
          >
            <option
              v-for="person in store.people.data"
              :key="person.id"
              :value="person.id"
            >
              {{ person.fullName }}
            </option>
          </select>
        </span>

        <span class="rform__field">
          <label for="rel-type">Link</label>
          <select
            id="rel-type"
            v-model="type"
            name="type"
          >
            <option
              v-for="option in RELATION_TYPES"
              :key="option"
              :value="option"
            >
              {{ option.toLowerCase() }}
            </option>
          </select>
        </span>

        <span class="rform__field">
          <label for="rel-target">{{ WORDING[type].to }}</label>
          <select
            id="rel-target"
            v-model="target"
            name="toId"
          >
            <option value="">
              choose a person…
            </option>
            <option
              v-for="person in others"
              :key="person.id"
              :value="person.id"
            >
              {{ person.fullName }}
            </option>
          </select>
        </span>
      </div>

      <p class="rform__hint">
        {{ WORDING[type].from }} → {{ WORDING[type].to }}. Two people of this
        tree, never the same person twice — and a parent link may not close
        the family into a loop (FR-5.4).
      </p>

      <p
        v-if="error"
        class="rform__error"
        role="alert"
      >
        {{ error }}
      </p>

      <div class="rform__actions">
        <button
          type="submit"
          :disabled="saving"
        >
          {{ saving ? 'Saving…' : 'Add link' }}
        </button>
        <button
          type="button"
          class="rform__cancel"
          :disabled="saving"
          @click="emit('close')"
        >
          Close
        </button>
      </div>
    </form>

    <section
      v-if="links.length > 0"
      class="links"
      aria-labelledby="links-title"
    >
      <h2
        id="links-title"
        class="links__title"
      >
        Links recorded
      </h2>

      <ul class="links__list">
        <li
          v-for="relation in links"
          :key="relation.id"
          class="links__item"
        >
          <span class="links__text">
            {{ nameOf(relation.fromId) }}
            <strong>{{ relation.type.toLowerCase() }}</strong>
            {{ nameOf(relation.toId) }}
          </span>
          <button
            type="button"
            class="links__remove"
            :disabled="saving"
            :aria-label="`Remove the link between ${nameOf(relation.fromId)} and ${nameOf(relation.toId)}`"
            @click="onUnlink(relation.id)"
          >
            Remove
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.rpanel {
  display: grid;
  gap: 0.75rem;
}

.rform {
  display: grid;
  gap: 0.6rem;
  padding: 1rem 1.1rem 1.1rem;
  border: var(--hairline) solid var(--border);
  border-left: 3px solid var(--primary);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.rform__title,
.links__title {
  margin: 0;
  font-size: 1.02rem;
}

.rform__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.rform__field {
  flex: 1 1 11rem;
  min-width: 0;
  display: grid;
  gap: 0.25rem;
}

.rform__field label {
  font-size: 0.85rem;
}

.rform__field select {
  width: 100%;
  padding: 0.45rem 0.5rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-control);
  font: inherit;
  background: var(--surface);
}

.rform__hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.rform__error {
  margin: 0;
  padding: 0.5rem 0.75rem;
  border: var(--hairline) solid var(--border);
  border-left: 3px solid var(--danger);
  border-radius: var(--radius-card);
  font-size: 0.88rem;
}

.rform__actions {
  display: flex;
  gap: 0.6rem;
}

.rform__cancel {
  background: var(--surface);
  border: var(--hairline) solid var(--border);
}

.links {
  padding: 0.85rem 1rem 1rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.links__title {
  margin-bottom: 0.5rem;
}

.links__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}

.links__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.88rem;
}

.links__text strong {
  margin: 0 0.3rem;
  color: var(--text-muted);
  font-weight: 600;
}

.links__remove {
  font: inherit;
  font-size: 0.8rem;
  padding: 0.15rem 0.6rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-control);
  background: var(--surface);
  cursor: pointer;
}

.links__remove:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
