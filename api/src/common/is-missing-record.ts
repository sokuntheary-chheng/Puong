import { Prisma } from '@prisma/client';

/**
 * `P2025` — "An operation failed because it depends on one or more records
 * that were required but were not found."
 *
 * It is Prisma's way of saying *no such row* for `update` and `delete`, which
 * are the two operations that do not report a missing record through
 * `findUnique`. Services turn it into a 404 at the call site, where they still
 * know which resource the id belonged to — a generic "not found" from the
 * filter would not say *what* was missing.
 */
export function isMissingRecord(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  );
}
