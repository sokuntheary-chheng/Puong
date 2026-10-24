/**
 * Checks for src/utils/memoryValidation.ts — FR-6.1 and FR-6.2.
 *
 * The date rules in particular cannot be reached through a real
 * <input type="date">, which refuses impossible dates at the control, so
 * they are asserted here against the raw values an API would receive.
 */

import {
  MAX_IMAGE_BYTES,
  isFormValid,
  validateBody,
  validateHappenedAt,
  validateMemory,
  validatePhoto,
  validateTitle,
} from '../../.checks/memoryValidation.mjs';

const problems = [];

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`  ok    ${label}`);
  else problems.push(`${label}\n          expected ${e}\n          got      ${a}`);
}

const isNull = (value, label) => eq(value, null, label);

/* ---- FR-6.1: title and body required ---- */
isNull(validateTitle('An afternoon'), 'a non-empty title passes');
eq(validateTitle(''), 'A title is required.', 'an empty title fails');
eq(validateTitle('   '), 'A title is required.', 'a whitespace-only title fails');
isNull(validateBody('Some text.'), 'a non-empty body passes');
eq(validateBody(''), 'A body is required.', 'an empty body fails');
eq(validateBody('\n\t  '), 'A body is required.', 'a whitespace-only body fails');

/* ---- FR-6.1: the occurred date is optional, but real when present ---- */
isNull(validateHappenedAt(''), 'an omitted date passes');
isNull(validateHappenedAt('1998-12-24'), 'an ordinary date passes');
isNull(validateHappenedAt('2024-02-29'), '29 February 2024 passes — 2024 is a leap year');
eq(
  validateHappenedAt('2026-02-29'),
  'That date does not exist.',
  '29 February 2026 fails — 2026 is not a leap year',
);
eq(
  validateHappenedAt('2026-02-31'),
  'That date does not exist.',
  '31 February fails instead of rolling over into March',
);
eq(validateHappenedAt('2026-13-01'), 'That date does not exist.', 'month 13 fails');
eq(validateHappenedAt('2026-00-10'), 'That date does not exist.', 'month 0 fails');
eq(validateHappenedAt('2026-04-31'), 'That date does not exist.', '31 April fails');
eq(
  validateHappenedAt('24/12/1998'),
  'Use a date in the form YYYY-MM-DD.',
  'a non-ISO date fails the format check',
);

/* ---- FR-6.2: the photograph is optional, JPEG/PNG/WebP up to 5 MB ---- */
isNull(validatePhoto(null), 'no photograph passes');
isNull(
  validatePhoto(new File([new Uint8Array(10)], 'a.jpg', { type: 'image/jpeg' })),
  'a JPEG passes',
);
isNull(
  validatePhoto(new File([new Uint8Array(10)], 'a.png', { type: 'image/png' })),
  'a PNG passes',
);
isNull(
  validatePhoto(new File([new Uint8Array(10)], 'a.webp', { type: 'image/webp' })),
  'a WebP passes',
);
isNull(
  validatePhoto(
    new File([new Uint8Array(MAX_IMAGE_BYTES)], 'full.jpg', { type: 'image/jpeg' }),
  ),
  'a photograph of exactly 5 MB passes — the limit is inclusive',
);
eq(
  validatePhoto(
    new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'over.jpg', { type: 'image/jpeg' }),
  ),
  'A photograph may be at most 5 MB; this one is 5.0 MB.',
  '5 MB and one byte fails',
);
eq(
  validatePhoto(new File([new Uint8Array(10)], 'a.gif', { type: 'image/gif' })),
  'A photograph must be one of JPEG, PNG, WebP; this one is image/gif.',
  'a GIF is rejected by format',
);
eq(
  validatePhoto(new File([new Uint8Array(10)], 'a.pdf', { type: '' })),
  'A photograph must be one of JPEG, PNG, WebP; this one is no type the browser recognises.',
  'a file with no declared type is rejected, without claiming a type it does not have',
);

/* ---- the whole form ---- */
const empty = validateMemory({ title: '', body: '', happenedAt: '', photo: null });
eq(Object.keys(empty).sort(), ['body', 'title'], 'an empty form fails on title and body only');
eq(isFormValid(empty), false, 'an empty form is not valid');

const complete = validateMemory({
  title: 'The river house',
  body: 'Still standing.',
  happenedAt: '1998-12-24',
  photo: null,
});
eq(complete, {}, 'a complete form has no errors');
eq(isFormValid(complete), true, 'a complete form is valid');

const allBad = validateMemory({
  title: ' ',
  body: '',
  happenedAt: '2026-02-31',
  photo: new File([new Uint8Array(10)], 'a.gif', { type: 'image/gif' }),
});
eq(
  Object.keys(allBad).sort(),
  ['body', 'happenedAt', 'photo', 'title'],
  'every rule can fail at once, and each is reported separately',
);

if (problems.length > 0) {
  console.error('\n  memory validation FAILED:');
  for (const p of problems) console.error(`  FAIL  ${p}`);
  process.exit(1);
}
