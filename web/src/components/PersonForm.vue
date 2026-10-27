<script setup lang="ts">
import { computed, ref } from 'vue';
import { ApiError, createPerson, updatePerson, uploadPhoto } from '../services/api';
import { ALLOWED_IMAGE_LABELS, MAX_IMAGE_MB, validatePhoto } from '../utils/memoryValidation';
import { validatePerson } from '../utils/personValidation';
import type { Person } from '../types';

/**
 * The person form — story 4's "add a person", and story 7's "edit one".
 *
 * One component for both, because they are one form with one set of rules
 * (FR-4.1's name, FR-4.2's date order) and two different submits: the
 * difference is a URL, not a screen. Passing `person` switches it to
 * editing and pre-fills from the record, so an edit never starts from an
 * empty form the user then has to refill from memory.
 *
 * The photograph goes up on its own request (FR-6.2) *before* the person is
 * written, and only its url joins that body. The order matters: a person
 * saved with a url that was never stored would draw a broken image forever,
 * while a photograph stored for a person that failed to save is only a file
 * on disk nobody points at — the recoverable mistake is the one to make.
 */
const props = defineProps<{
  treeId: string;
  /** `null` for a new person; the record being edited otherwise. */
  person: Person | null;
}>();

const emit = defineEmits<{
  saved: [person: Person];
  close: [];
}>();

const fullName = ref(props.person?.fullName ?? '');
const nickname = ref(props.person?.nickname ?? '');
const gender = ref<Person['gender'] | ''>(props.person?.gender ?? '');
const birthDate = ref(props.person?.birthDate ?? '');
const deathDate = ref(props.person?.deathDate ?? '');
const isLiving = ref(props.person?.isLiving ?? true);
const bio = ref(props.person?.bio ?? '');

const photo = ref<File | null>(null);
const photoName = ref('');

const submitted = ref(false);
const saving = ref(false);
const serverError = ref<string | null>(null);

/** The photograph already on the record, if there is one. */
const currentPhotoUrl = ref<string | null>(props.person?.photoUrl ?? null);

const errors = computed(() =>
  validatePerson({
    fullName: fullName.value,
    birthDate: birthDate.value,
    deathDate: deathDate.value,
  }),
);

/** Shown once the user has submitted, or left the field. */
function errorFor(field: 'fullName' | 'dates'): string | null {
  if (!submitted.value) return null;
  return errors.value[field] ?? null;
}

function photoError(): string | null {
  if (!submitted.value) return null;
  return validatePhoto(photo.value);
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  photo.value = input.files?.[0] ?? null;
  photoName.value = photo.value?.name ?? '';
}

function onClearPhoto(): void {
  photo.value = null;
  photoName.value = '';
}

async function onSubmit(): Promise<void> {
  submitted.value = true;
  serverError.value = null;
  if (saving.value) return;

  if (Object.keys(errors.value).length > 0 || photoError() !== null) {
    document.getElementById(
      errors.value.fullName !== undefined ? 'person-fullName' : 'person-birthDate',
    )?.focus();
    return;
  }

  saving.value = true;
  try {
    /* FR-6.2 first: upload, then write the url into the record. */
    if (photo.value !== null) {
      const uploaded = await uploadPhoto(photo.value);
      currentPhotoUrl.value = uploaded.url;
    }

    /* An empty optional string means two different things on the two paths:
       for a new record there is nothing to clear, so an empty nickname is
       left out and the column stays NULL; for an edit it *is* the clearing,
       and is sent as `""` because `UpdatePersonDto` has no `null` for a
       nickname to become. */
    const editingPerson = props.person;
    const nick = nickname.value.trim();
    const text = bio.value.trim();

    const payload: Parameters<typeof createPerson>[1] = {
      fullName: fullName.value.trim(),
      gender: gender.value === '' ? undefined : gender.value,
      birthDate: birthDate.value,
      deathDate: deathDate.value,
      isLiving: isLiving.value,
      ...(nick === ''
        ? editingPerson !== null
          ? { nickname: '' }
          : {}
        : { nickname: nick }),
      ...(text === ''
        ? editingPerson !== null
          ? { bio: '' }
          : {}
        : { bio: text }),
      ...(currentPhotoUrl.value === null
        ? {}
        : { photoUrl: currentPhotoUrl.value }),
    };

    const saved =
      editingPerson === null
        ? await createPerson(props.treeId, payload)
        : await updatePerson(props.treeId, editingPerson.id, payload);

    emit('saved', saved);
  } catch (reason) {
    serverError.value =
      reason instanceof ApiError
        ? reason.message
        : 'The person could not be saved. Please try again.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <form
    novalidate
    class="pform"
    @submit.prevent="onSubmit"
  >
    <h2 class="pform__title">
      {{ person === null ? 'Add a person' : `Edit ${person.fullName}` }}
    </h2>

    <div
      class="pform__field"
      :class="{ 'pform__field--invalid': errorFor('fullName') }"
    >
      <label for="person-fullName">Full name <span aria-hidden="true">*</span></label>
      <input
        id="person-fullName"
        v-model="fullName"
        type="text"
        name="fullName"
        maxlength="120"
        autocomplete="off"
        required
        :aria-invalid="errorFor('fullName') ? 'true' : undefined"
        aria-describedby="person-fullName-hint"
      />
      <p
        id="person-fullName-hint"
        class="pform__hint"
        :class="{ 'pform__hint--error': errorFor('fullName') }"
      >
        {{ errorFor('fullName') ?? 'Required — everything else is optional (FR-4.1).' }}
      </p>
    </div>

    <div class="pform__row">
      <div class="pform__field">
        <label for="person-nickname">Nickname</label>
        <input
          id="person-nickname"
          v-model="nickname"
          type="text"
          name="nickname"
          maxlength="120"
          autocomplete="off"
        />
      </div>

      <div class="pform__field">
        <label for="person-gender">Gender</label>
        <select
          id="person-gender"
          v-model="gender"
          name="gender"
        >
          <option value="">
            not recorded
          </option>
          <option value="FEMALE">
            Female
          </option>
          <option value="MALE">
            Male
          </option>
          <option value="OTHER">
            Other
          </option>
        </select>
      </div>
    </div>

    <div
      class="pform__field"
      :class="{ 'pform__field--invalid': errorFor('dates') }"
    >
      <div class="pform__row">
        <span class="pform__half">
          <label for="person-birthDate">Born</label>
          <input
            id="person-birthDate"
            v-model="birthDate"
            type="date"
            name="birthDate"
          />
        </span>
        <span class="pform__half">
          <label for="person-deathDate">Died</label>
          <input
            id="person-deathDate"
            v-model="deathDate"
            type="date"
            name="deathDate"
            :disabled="isLiving"
          />
        </span>
      </div>
      <p
        class="pform__hint"
        :class="{ 'pform__hint--error': errorFor('dates') }"
      >
        {{
          errorFor('dates') ??
            'YYYY-MM-DD. A death date before the birth date is refused (FR-4.2).'
        }}
      </p>
    </div>

    <div class="pform__field pform__check">
      <input
        id="person-isLiving"
        v-model="isLiving"
        type="checkbox"
        name="isLiving"
      />
      <label for="person-isLiving">Still living</label>
    </div>

    <div class="pform__field">
      <label for="person-bio">Biography</label>
      <textarea
        id="person-bio"
        v-model="bio"
        name="bio"
        rows="3"
        maxlength="4000"
      />
      <p class="pform__hint">
        Optional — a name, a birth date and a photograph or a biography make a
        complete profile (FR-4.3).
      </p>
    </div>

    <div
      class="pform__field"
      :class="{ 'pform__field--invalid': photoError() }"
    >
      <label for="person-photo">Photograph</label>

      <img
        v-if="currentPhotoUrl && photo === null"
        class="pform__preview"
        :src="currentPhotoUrl"
        alt=""
      />

      <input
        id="person-photo"
        type="file"
        name="photo"
        accept="image/jpeg,image/png,image/webp"
        @change="onFileChange"
      />
      <p
        class="pform__hint"
        :class="{ 'pform__hint--error': photoError() }"
      >
        {{
          photoError() ??
            `${photoName === '' ? 'Optional' : photoName} — ${ALLOWED_IMAGE_LABELS}, up to ${MAX_IMAGE_MB} MB (FR-6.2).`
        }}
      </p>
      <button
        v-if="photo !== null"
        type="button"
        class="pform__clear"
        @click="onClearPhoto"
      >
        Remove the chosen file
      </button>
    </div>

    <p
      v-if="serverError"
      class="pform__error"
      role="alert"
    >
      {{ serverError }}
    </p>

    <div class="pform__actions">
      <button
        type="submit"
        :disabled="saving"
      >
        {{ saving ? 'Saving…' : person === null ? 'Add person' : 'Save changes' }}
      </button>
      <button
        type="button"
        class="pform__cancel"
        :disabled="saving"
        @click="emit('close')"
      >
        Cancel
      </button>
    </div>
  </form>
</template>

<style scoped>
.pform {
  display: grid;
  gap: 0.7rem;
  padding: 1rem 1.1rem 1.15rem;
  border: var(--hairline) solid var(--border);
  border-left: 3px solid var(--primary);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.pform__title {
  margin: 0;
  font-size: 1.05rem;
}

.pform__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.pform__half {
  flex: 1 1 10rem;
  min-width: 0;
}

.pform__field {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
}

.pform__field label {
  font-size: 0.88rem;
}

.pform__field input[type='text'],
.pform__field input[type='date'],
.pform__field select,
.pform__field textarea {
  width: 100%;
  padding: 0.45rem 0.5rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-control);
  font: inherit;
  background: var(--surface);
  resize: vertical;
}

.pform__field--invalid input,
.pform__field--invalid select,
.pform__field--invalid textarea {
  border-color: var(--danger);
}

.pform__check {
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.5rem;
}

.pform__check label {
  margin: 0;
}

.pform__hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.pform__hint--error {
  color: var(--danger);
}

.pform__preview {
  width: 5rem;
  height: 5rem;
  object-fit: cover;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-control);
}

.pform__clear {
  justify-self: start;
  font: inherit;
  font-size: 0.8rem;
  padding: 0.15rem 0.6rem;
  border: var(--hairline) solid var(--border);
  border-radius: var(--radius-control);
  background: var(--surface);
  cursor: pointer;
}

.pform__error {
  margin: 0;
  padding: 0.5rem 0.75rem;
  border: var(--hairline) solid var(--border);
  border-left: 3px solid var(--danger);
  border-radius: var(--radius-card);
  font-size: 0.88rem;
}

.pform__actions {
  display: flex;
  gap: 0.6rem;
}

.pform__cancel {
  background: var(--surface);
  border: var(--hairline) solid var(--border);
}
</style>
