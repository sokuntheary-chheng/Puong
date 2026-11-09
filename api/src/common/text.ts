/**
 * Trim a free-text field, and turn an empty one into "no value".
 *
 * Shared by the person, tree and memory services because all three face the
 * same edge case: a form that submits `"   "` in a box somebody meant to
 * leave blank. Stored verbatim, that becomes a nickname of three spaces in
 * the family record — displayed as a name that looks present and is not.
 *
 * - `undefined` → the field was not in the body → keep what is stored
 * - `null`      → the field was explicitly cleared → store null
 * - `'   '`     → whitespace only → store null
 */
export function text(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
