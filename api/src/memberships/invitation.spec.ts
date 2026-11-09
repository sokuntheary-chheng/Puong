import {
  INVITATION_TTL_DAYS,
  invitationExpiresAt,
  isInvitationExpired,
} from './invitation';

/**
 * FR-3.4 — an invitation that is not accepted within 7 days expires.
 *
 * The whole rule is in this file rather than in a service because expiry is
 * a *date arithmetic* question, and date arithmetic is exactly the kind of
 * thing that is right on the day it is written and wrong at midnight on the
 * day it matters. `now` is passed in, so every boundary below is tested
 * rather than waited for.
 *
 * The bug this would catch: comparing with `<` where the rule says "within
 * seven days" means *seven days exactly* has still not expired — an
 * off-by-one that quietly grants or denies a whole extra day, and that no
 * end-to-end test could pin down without running for a week.
 */
describe('invitation expiry (FR-3.4)', () => {
  const invitedAt = new Date('2026-10-01T09:00:00.000Z');

  it('lives for exactly seven days', () => {
    expect(INVITATION_TTL_DAYS).toBe(7);
    expect(invitationExpiresAt(invitedAt)).toEqual(
      new Date('2026-10-08T09:00:00.000Z'),
    );
  });

  it('is still answerable one second before the deadline', () => {
    const now = new Date('2026-10-08T08:59:59.000Z');
    expect(isInvitationExpired(invitedAt, now)).toBe(false);
  });

  it('has expired the instant the deadline passes', () => {
    const now = new Date('2026-10-08T09:00:00.000Z');
    expect(isInvitationExpired(invitedAt, now)).toBe(true);
  });

  it('stays expired', () => {
    expect(
      isInvitationExpired(invitedAt, new Date('2026-11-30T00:00:00.000Z')),
    ).toBe(true);
  });

  it('treats a row with no send date as expired rather than as open forever', () => {
    /* `INVITED` without `invitedAt` is only reachable by writing the
       database directly — but answering "not expired" for it would turn a
       malformed row into a membership nobody can end. */
    expect(invitationExpiresAt(null)).toBeNull();
    expect(invitationExpiresAt(undefined)).toBeNull();
    expect(isInvitationExpired(null)).toBe(true);
    expect(isInvitationExpired(undefined)).toBe(true);
  });
});
