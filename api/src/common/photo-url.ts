/**
 * What a `photoUrl` / `coverPhotoUrl` may contain.
 *
 * **Only a photograph this API stored.** The pattern is the exact shape
 * `UploadsController` generates (32 hex bytes, one of three extensions), so
 * a stored URL cannot be turned into an open redirect, a `javascript:` URL
 * in an `<img src>`, or a pointer to somebody else's site that tells the
 * browser where this family's members are looking.
 *
 * It is a rule about the *format*, applied by the DTOs that receive the
 * field — the one place every request to a person, a memory or a tree passes
 * through, and therefore the one place it has to be written.
 */
export const PHOTO_URL_PATTERN =
  /^\/api\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/;

export const PHOTO_URL_MESSAGE =
  'A photograph must be one this app uploaded: upload the file first and send back the url the upload returns.';
