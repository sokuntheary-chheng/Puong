/**
 * Invitation expiry — FR-3.4, in one pure function so it can be tested
 * without a database or a clock.
 *
 * **An invitation lives for 7 days from `invitedAt`, and it is evaluated when
 * it is read** rather than by a background job. The SRS is explicit that this
 * is the MVP's choice (`docs/SRS.md`, FR-10): a job would only *write* a
 * state this function already knows, and a cron inside a single API process
 * is one more thing to be wrong at 3 a.m. for a family archive with a
 * handful of members. The consequence is that an expired invitation is
 * invisible to the invited account and refused by `MembershipsService.update`
 * — two reads of the same rule, one source for both.
 *
 * `now` is a parameter, never read from the clock inside: an expiry bug that
 * only appears at midnight is not the kind of bug a test should have to wait
 * for.
 */

/** FR-3.4 — how long an invitation stays answerable. */
export const INVITATION_TTL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The instant after which the invitation can no longer be accepted. */
export function invitationExpiresAt(
  invitedAt: Date | null | undefined,
): Date | null {
  if (invitedAt === null || invitedAt === undefined) return null;
  return new Date(invitedAt.getTime() + INVITATION_TTL_DAYS * DAY_MS);
}

/**
 * `true` when the invitation may no longer be accepted.
 *
 * An invitation that was never sent (`invitedAt === null`) is not "expired",
 * it is *not an invitation* — a row with status `INVITED` and no `invitedAt`
 * is only possible by writing the database directly, and answering `false`
 * keeps that from silently becoming a permanent membership.
 */
export function isInvitationExpired(
  invitedAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  const expires = invitationExpiresAt(invitedAt);
  if (expires === null) return true;
  return expires.getTime() <= now.getTime();
}
