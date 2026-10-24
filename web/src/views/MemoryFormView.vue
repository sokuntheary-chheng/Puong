<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useStringParam } from '../composables/useRouteString';
import { useMemoriesStore } from '../stores/memories';
import type { MemoryVisibility } from '../mock/types';
import {
  ALLOWED_IMAGE_LABELS,
  MAX_IMAGE_MB,
  isFormValid,
  validateBody,
  validateHappenedAt,
  validateMemory,
  validatePhoto,
  validateTitle,
} from '../utils/memoryValidation';
import type { FieldName } from '../utils/memoryValidation';

/**
 * /trees/:treeId/people/:personId/memories/new — M1 item 4.
 *
 * The M1 checklist's "one form with client-side validation". The rules
 * themselves live in src/utils/memoryValidation.ts so that the M2 service
 * layer can apply the same ones server-side; this component only decides
 * when to show them.
 *
 * Error strategy: nothing is marked invalid until the user has either tried
 * to submit or left a field. Reporting a required title before the user has
 * had a chance to type it is the most common way a form feels like it is
 * scolding you, and it also breaks screen readers that announce on focus.
 */
const treeId = useStringParam('treeId');
const personId = useStringParam('personId');
const memories = useMemoriesStore();

const title = ref('');
const body = ref('');
const happenedAt = ref('');
const visibility = ref<MemoryVisibility>('TREE');
const photo = ref<File | null>(null);
const photoName = ref('');

const submitted = ref(false);
const accepted = ref(false);

type Touched = Record<FieldName, boolean>;
const touched = reactive<Touched>({
  title: false,
  body: false,
  happenedAt: false,
  photo: false,
});

const errors = computed(() =>
  validateMemory({
    title: title.value,
    body: body.value,
    happenedAt: happenedAt.value,
    photo: photo.value,
  }),
);

const isValid = computed(() => isFormValid(errors.value));

/** Show an error once the field has been submitted or left. */
function errorFor(field: FieldName): string | null {
  if (!submitted.value && !touched[field]) return null;
  return errors.value[field] ?? null;
}

function onBlur(field: FieldName): void {
  touched[field] = true;
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  photo.value = file;
  photoName.value = file?.name ?? '';
  touched.photo = true;
}

function clearPhoto(): void {
  photo.value = null;
  photoName.value = '';
  touched.photo = true;
}

async function onSubmit(): Promise<void> {
  submitted.value = true;
  accepted.value = false;
  memories.clearCreated();

  if (!isValid.value) {
    /* Focus the first field that is wrong, so the keyboard user is taken
       to the problem instead of having to hunt for it. */
    const order: FieldName[] = ['title', 'body', 'happenedAt', 'photo'];
    const firstBad = order.find((f) => errors.value[f] !== undefined);
    if (firstBad) {
      document.getElementById(`memory-${firstBad}`)?.focus();
    }
    return;
  }

  accepted.value = await memories.create({
    treeId: treeId.value,
    personId: personId.value,
    title: title.value,
    body: body.value,
    happenedAt: happenedAt.value,
    visibility: visibility.value,
  });
}

function resetForm(): void {
  title.value = '';
  body.value = '';
  happenedAt.value = '';
  visibility.value = 'TREE';
  clearPhoto();
  submitted.value = false;
  accepted.value = false;
  for (const key of Object.keys(touched) as FieldName[]) touched[key] = false;
}

/* Live hints, so the rule is visible before the user trips over it. */
const titleHint = computed(() => {
  const error = validateTitle(title.value);
  return error === null ? 'Required.' : error;
});
const bodyHint = computed(() => {
  const error = validateBody(body.value);
  return error === null ? 'Required.' : error;
});
const dateHint = computed(() => {
  const error = validateHappenedAt(happenedAt.value);
  return error === null ? 'Optional.' : error;
});
const photoHint = computed(() => {
  const error = validatePhoto(photo.value);
  return error === null
    ? `Optional — ${ALLOWED_IMAGE_LABELS} up to ${MAX_IMAGE_MB} MB.`
    : error;
});

const acceptedSummary = computed(() => [
  ['Tree', treeId.value],
  ['Person', personId.value],
  ['Title', title.value.trim()],
  ['Body', body.value.trim()],
  ['Occurred', happenedAt.value === '' ? 'no date given' : happenedAt.value],
  ['Visibility', visibility.value],
  ['Photograph', photoName.value === '' ? 'none' : photoName.value],
]);
</script>

<template>
  <section>
    <p class="crumb">
      <RouterLink :to="{ name: 'person', params: { treeId, personId } }">
        {{ personId }}
      </RouterLink>
      / new memory
    </p>

    <h1>Add a memory</h1>

    <form
      novalidate
      class="form"
      @submit.prevent="onSubmit"
    >
      <!-- Title -->
      <div
        class="field"
        :class="{ 'field--invalid': errorFor('title') }"
      >
        <label for="memory-title">Title</label>
        <input
          id="memory-title"
          v-model="title"
          type="text"
          name="title"
          autocomplete="off"
          :aria-invalid="errorFor('title') ? 'true' : undefined"
          aria-describedby="memory-title-hint"
          @blur="onBlur('title')"
        />
        <p
          id="memory-title-hint"
          class="field__hint"
          :class="{ 'field__hint--error': errorFor('title') }"
        >
          {{ errorFor('title') ?? titleHint }}
        </p>
      </div>

      <!-- Body -->
      <div
        class="field"
        :class="{ 'field--invalid': errorFor('body') }"
      >
        <label for="memory-body">Body</label>
        <textarea
          id="memory-body"
          v-model="body"
          name="body"
          rows="6"
          :aria-invalid="errorFor('body') ? 'true' : undefined"
          aria-describedby="memory-body-hint"
          @blur="onBlur('body')"
        />
        <p
          id="memory-body-hint"
          class="field__hint"
          :class="{ 'field__hint--error': errorFor('body') }"
        >
          {{ errorFor('body') ?? bodyHint }}
        </p>
      </div>

      <!-- Occurred -->
      <div
        class="field"
        :class="{ 'field--invalid': errorFor('happenedAt') }"
      >
        <label for="memory-happenedAt">Occurred on</label>
        <input
          id="memory-happenedAt"
          v-model="happenedAt"
          type="date"
          name="happenedAt"
          :aria-invalid="errorFor('happenedAt') ? 'true' : undefined"
          aria-describedby="memory-happenedAt-hint"
          @blur="onBlur('happenedAt')"
        />
        <p
          id="memory-happenedAt-hint"
          class="field__hint"
          :class="{ 'field__hint--error': errorFor('happenedAt') }"
        >
          {{ errorFor('happenedAt') ?? dateHint }}
        </p>
      </div>

      <!-- Visibility (FR-6.6) -->
      <fieldset class="field">
        <legend>Who can see it</legend>
        <label class="choice">
          <input
            v-model="visibility"
            type="radio"
            name="visibility"
            value="TREE"
          />
          <span>
            Everyone in the tree
            <small>Every active member can read it.</small>
          </span>
        </label>
        <label class="choice">
          <input
            v-model="visibility"
            type="radio"
            name="visibility"
            value="PRIVATE"
          />
          <span>
            Only me
            <small>Nobody else sees it — not even the owner (FR-6.6).</small>
          </span>
        </label>
      </fieldset>

      <!-- Photograph (FR-6.2) -->
      <div
        class="field"
        :class="{ 'field--invalid': errorFor('photo') }"
      >
        <label for="memory-photo">Photograph</label>
        <input
          id="memory-photo"
          type="file"
          name="photo"
          accept="image/jpeg,image/png,image/webp"
          :aria-invalid="errorFor('photo') ? 'true' : undefined"
          aria-describedby="memory-photo-hint"
          @change="onFileChange"
        />
        <p
          id="memory-photo-hint"
          class="field__hint"
          :class="{ 'field__hint--error': errorFor('photo') }"
        >
          {{ errorFor('photo') ?? photoHint }}
        </p>
        <p
          v-if="photoName"
          class="field__chosen"
        >
          {{ photoName }}
          <button
            type="button"
            @click="clearPhoto"
          >
            Remove
          </button>
        </p>
      </div>

      <div class="actions">
        <button
          type="submit"
          :disabled="memories.created.status === 'loading'"
        >
          {{ memories.created.status === 'loading' ? 'Saving…' : 'Save memory' }}
        </button>
        <button
          type="button"
          class="actions__secondary"
          @click="resetForm"
        >
          Clear
        </button>
      </div>

      <p
        v-if="submitted && !isValid"
        class="form__summary"
        role="alert"
      >
        {{ Object.keys(errors).length }}
        field(s) need attention before this can be saved.
      </p>

      <p
        v-if="memories.created.status === 'error'"
        class="form__summary"
        role="alert"
      >
        The memory could not be saved: {{ memories.created.error }}
      </p>
    </form>

    <div
      v-if="accepted"
      class="accepted"
      role="status"
    >
      <h2>Saved</h2>
      <p>
        Written as <code>{{ memories.created.data?.id }}</code> and placed at
        the top of this person's memories.
      </p>
      <dl>
        <template
          v-for="[label, value] in acceptedSummary"
          :key="label"
        >
          <dt>{{ label }}</dt>
          <dd>{{ value }}</dd>
        </template>
      </dl>
      <RouterLink
        class="accepted__back"
        :to="{ name: 'person', params: { treeId, personId } }"
      >
        Back to {{ personId }}
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.crumb {
  font-size: 0.9rem;
  color: var(--puong-muted, #6b6257);
}

.form {
  display: grid;
  gap: 1.25rem;
  max-width: 34rem;
  margin-top: 1.25rem;
}

.field {
  display: grid;
  gap: 0.3rem;
  border: 0;
  padding: 0;
  margin: 0;
}

.field > label,
.field > legend {
  font-weight: 600;
  font-size: 0.95rem;
}

.field input[type='text'],
.field input[type='date'],
.field textarea {
  padding: 0.45rem 0.5rem;
  border: 1px solid var(--puong-rule, #d8d2c6);
  border-radius: 4px;
  font: inherit;
}

.field--invalid input,
.field--invalid textarea {
  border-color: var(--puong-danger, #a4322a);
}

.field__hint {
  font-size: 0.82rem;
  color: var(--puong-muted, #6b6257);
}

.field__hint--error {
  color: var(--puong-danger, #a4322a);
  font-weight: 600;
}

.field__chosen {
  font-size: 0.85rem;
}

.choice {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  margin-top: 0.4rem;
  font-weight: 400;
}

.choice small {
  display: block;
  color: var(--puong-muted, #6b6257);
  font-weight: 400;
}

.actions {
  display: flex;
  gap: 0.75rem;
}

.actions__secondary {
  background: none;
  border: 1px solid var(--puong-rule, #d8d2c6);
}

.form__summary {
  color: var(--puong-danger, #a4322a);
  font-weight: 600;
}

.accepted {
  margin-top: 1.5rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--puong-rule, #d8d2c6);
  border-left: 4px solid var(--puong-ok, #2f6b46);
  border-radius: 6px;
  background: var(--puong-surface, #fffdf8);
}

.accepted h2 {
  margin: 0 0 0.25rem;
  font-size: 1.05rem;
}

.accepted p {
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
  color: var(--puong-muted, #6b6257);
}

.accepted dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.2rem 1rem;
  margin: 0;
  font-size: 0.9rem;
}

.accepted dt {
  color: var(--puong-muted, #6b6257);
}

.accepted dd {
  margin: 0;
}

.accepted__back {
  display: inline-block;
  margin-top: 0.85rem;
  font-size: 0.9rem;
}
</style>
