/**
 * Client-side validation for the person form (story 4).
 *
 * The same reasoning as `utils/memoryValidation.ts`: the rules are pure
 * functions so that they can be tested without mounting anything, and so
 * that the API's own validation stays the rule that actually decides. What
 * lives here is the part the user should be told *before* a request is
 * made — FR-4.1's required name and FR-4.2's date order.
 *
 * Every message matches the one the API produces for the same rule, so a
 * user who does manage to bypass the form sees the same sentence they
 * would have seen here rather than a second vocabulary for one fact.
 */

import { validateHappenedAt } from './memoryValidation';
import type { ValidationResult } from './memoryValidation';

/** FR-4.1 — the one field every person must have. */
export function validateFullName(value: string): ValidationResult {
  const length = value.trim().length;
  if (length === 0) return 'A full name is required.';
  if (length > 120) return 'A full name may be at most 120 characters.';
  return null;
}

/**
 * FR-4.2 — a death date may not come before the birth date.
 *
 * Both are ISO calendar dates, so the comparison is lexicographic: no date
 * parsing, no time zone, nothing that can disagree with the server's own
 * comparison. An absent side cannot make the other unreasonable — an
 * unknown birth date does not make any death date wrong.
 */
export function validatePersonDates(
  birthDate: string,
  deathDate: string,
): ValidationResult {
  const born = validateHappenedAt(birthDate);
  if (born !== null) return `Birth date: ${born.toLowerCase()}`;

  const died = validateHappenedAt(deathDate);
  if (died !== null) return `Death date: ${died.toLowerCase()}`;

  if (deathDate !== '' && birthDate !== '' && deathDate < birthDate) {
    return 'The death date must not be before the birth date.';
  }
  return null;
}

/** The person form's whole answer, one entry per field that failed. */
export function validatePerson(input: {
  fullName: string;
  birthDate: string;
  deathDate: string;
}): Partial<Record<'fullName' | 'dates', string>> {
  const errors: Partial<Record<'fullName' | 'dates', string>> = {};

  const name = validateFullName(input.fullName);
  if (name !== null) errors.fullName = name;

  const dates = validatePersonDates(input.birthDate, input.deathDate);
  if (dates !== null) errors.dates = dates;

  return errors;
}
