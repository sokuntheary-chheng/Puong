/**
 * Client-side validation for the memory form (M1 item 4).
 *
 * These are pure functions rather than logic inside the component, for two
 * reasons. They are unit-testable without mounting anything, and NFR-3.1
 * asks for domain rules to live in testable functions — the M2 service layer
 * applies the same rules on the server, where the browser's word is not
 * trusted (IF-1.7).
 *
 * Every rule here traces to the specification. FR-6.1 makes the title and
 * the body required and the occurred date and photograph optional; FR-6.2
 * limits a photograph to JPEG, PNG or WebP up to 5 MB. The specification
 * states no length limit for a memory's title or body — FR-2.2 sets one for
 * tree names and is silent elsewhere — so none is invented here.
 */

/** FR-6.2 — the only formats a photograph may arrive in. */
export const ALLOWED_IMAGE_TYPES: ReadonlyArray<{ mime: string; label: string }> = [
  { mime: 'image/jpeg', label: 'JPEG' },
  { mime: 'image/png', label: 'PNG' },
  { mime: 'image/webp', label: 'WebP' },
];

/** FR-6.2 — 5 MB, the same number the API will enforce. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_LABELS = ALLOWED_IMAGE_TYPES.map((t) => t.label).join(', ');
export const MAX_IMAGE_MB = MAX_IMAGE_BYTES / (1024 * 1024);

export type FieldName = 'title' | 'body' | 'happenedAt' | 'photo';

/** A validation message, or null when the value is acceptable. */
export type ValidationResult = string | null;

/**
 * FR-6.1 — required. Whitespace only does not count as a title: a field that
 * has been "filled in" with spaces would otherwise pass an empty check and
 * reach the API as a blank record.
 */
export function validateTitle(value: string): ValidationResult {
  return value.trim() === '' ? 'A title is required.' : null;
}

/** FR-6.1 — required, on the same reasoning as the title. */
export function validateBody(value: string): ValidationResult {
  return value.trim() === '' ? 'A body is required.' : null;
}

/**
 * FR-6.1 — optional. When present it must be a real calendar date: an
 * `<input type="date">` yields `""` when cleared, but a value pasted or
 * scripted in can be anything, and `new Date('2026-02-31')` silently
 * becomes 2 March rather than failing.
 */
export function validateHappenedAt(value: string): ValidationResult {
  if (value === '') return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return 'Use a date in the form YYYY-MM-DD.';

  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);

  const constructed = new Date(Date.UTC(year, month - 1, day));
  const isReal =
    constructed.getUTCFullYear() === year &&
    constructed.getUTCMonth() === month - 1 &&
    constructed.getUTCDate() === day;

  if (!isReal) return 'That date does not exist.';
  return null;
}

/**
 * FR-6.2 — optional, but when present the type and size are fixed. Checked
 * against the file's declared MIME type, which is what the browser knows;
 * M2 re-checks the magic bytes, because a declared type is only a claim.
 */
export function validatePhoto(file: File | null): ValidationResult {
  if (file === null) return null;

  if (!ALLOWED_IMAGE_TYPES.some((t) => t.mime === file.type)) {
    const got = file.type === '' ? 'no type the browser recognises' : file.type;
    return `A photograph must be one of ${ALLOWED_IMAGE_LABELS}; this one is ${got}.`;
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return `A photograph may be at most ${MAX_IMAGE_MB} MB; this one is ${formatBytes(file.size)}.`;
  }

  return null;
}

/** Validate the whole form. Returns only the fields that failed. */
export function validateMemory(input: {
  title: string;
  body: string;
  happenedAt: string;
  photo: File | null;
}): Partial<Record<FieldName, string>> {
  const errors: Partial<Record<FieldName, string>> = {};

  const title = validateTitle(input.title);
  if (title) errors.title = title;

  const body = validateBody(input.body);
  if (body) errors.body = body;

  const happenedAt = validateHappenedAt(input.happenedAt);
  if (happenedAt) errors.happenedAt = happenedAt;

  const photo = validatePhoto(input.photo);
  if (photo) errors.photo = photo;

  return errors;
}

/** True when nothing is wrong. Used to decide whether submit may proceed. */
export function isFormValid(
  errors: Partial<Record<FieldName, string>>,
): boolean {
  return Object.keys(errors).length === 0;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
