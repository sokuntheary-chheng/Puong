import { BadRequestException } from '@nestjs/common';

/**
 * Rejects a `PATCH` that changes nothing.
 *
 * Every update DTO is partial, so an empty body is *valid* — and a valid
 * request that silently does nothing is worse than a rejected one, because
 * the client cannot tell a successful no-op from a bug. `PATCH` means "apply
 * these changes"; with no changes there is nothing to apply.
 */
export function assertSomeField(dto: object): void {
  const changed = Object.values(dto).some((value) => value !== undefined);
  if (!changed) {
    throw new BadRequestException(['Provide at least one field to change.']);
  }
}
