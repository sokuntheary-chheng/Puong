import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { AccessService, rank } from './access.service';

/**
 * The one place a role is interpreted (docs/design.md §2.1).
 *
 * Both halves of the rule live here — *not a member is 404, a member with
 * too little is 403* — and every guard in the API delegates to it, which is
 * why these two assertions are worth more than any number of tests on a
 * single controller.
 */
function makePrisma(role: 'OWNER' | 'CONTRIBUTOR' | 'VIEWER' | null) {
  return {
    membership: {
      findFirst: jest.fn().mockResolvedValue(role === null ? null : { role }),
    },
  };
}

describe('AccessService', () => {
  it('orders the roles the way the permission matrix does', () => {
    expect(rank('VIEWER')).toBeLessThan(rank('CONTRIBUTOR'));
    expect(rank('CONTRIBUTOR')).toBeLessThan(rank('OWNER'));
  });

  it('treats an unaccepted invitation as not a member (FR-2.3)', async () => {
    const prisma = makePrisma(null);
    const access = new AccessService(prisma as unknown as PrismaService);

    await expect(access.roleIn('t1', 'u3')).resolves.toBeNull();
  });

  it('answers a non-member with 404, so the tree’s existence is not confirmed (FR-2.5)', async () => {
    const prisma = makePrisma(null);
    const access = new AccessService(prisma as unknown as PrismaService);

    await expect(access.assertRole('t1', 'u3', 'VIEWER')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('answers a member with too little role with 403 (FR-3.6)', async () => {
    const prisma = makePrisma('VIEWER');
    const access = new AccessService(prisma as unknown as PrismaService);

    await expect(access.assertRole('t1', 'u3', 'CONTRIBUTOR')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('returns the role so the caller need not read it twice', async () => {
    const prisma = makePrisma('OWNER');
    const access = new AccessService(prisma as unknown as PrismaService);

    await expect(access.assertRole('t1', 'u1', 'VIEWER')).resolves.toBe(
      'OWNER',
    );
    await expect(access.assertRole('t1', 'u1', 'OWNER')).resolves.toBe('OWNER');
  });
});
