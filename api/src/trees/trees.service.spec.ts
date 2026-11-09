import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { TreesService } from './trees.service';

/**
 * Reads call `n` of a Jest mock as a shape.
 *
 * `mock.calls` is typed as `any[][]`, so indexing it directly is an unsafe
 * member access the linter (rightly) refuses — this narrows it once, here,
 * instead of casting at every assertion.
 */
function callArgs<T>(mock: { mock: { calls: unknown[][] } }, n = 0): T {
  const args = mock.mock.calls[n];
  if (args === undefined) throw new Error(`mock was not called (call ${n})`);
  return args[0] as T;
}

/**
 * Succession — FR-9.1 and FR-9.2, the rules that decide who owns a tree
 * tomorrow.
 *
 * Every case here is a rule the database cannot enforce: "must already be a
 * member", "must be the one nominated", "the old owner is demoted, not
 * removed". They live in this service and nowhere else, which is what makes
 * them testable without a session, a server or a clock.
 */
function makePrisma() {
  const tx = {
    tree: { update: jest.fn().mockResolvedValue({ id: 't1', ownerId: 'u2' }) },
    membership: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };

  return {
    tree: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 't1' }),
      delete: jest.fn().mockResolvedValue({ id: 't1' }),
    },
    membership: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
    tx,
  };
}

describe('TreesService succession (FR-9)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: TreesService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new TreesService(prisma as unknown as PrismaService);
  });

  describe('nominating a successor (FR-9.1)', () => {
    it('refuses somebody who is not an active member of this tree', async () => {
      prisma.tree.findUnique.mockResolvedValue({ successorId: null });
      prisma.membership.findUnique.mockResolvedValue(null);

      await expect(service.update('t1', { successorId: 'u9' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses a membership that is still only an invitation', async () => {
      prisma.tree.findUnique.mockResolvedValue({ successorId: null });
      prisma.membership.findUnique.mockResolvedValue({
        role: 'CONTRIBUTOR',
        status: 'INVITED',
      });

      await expect(service.update('t1', { successorId: 'u3' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses a viewer — a successor must be able to write the tree', async () => {
      prisma.tree.findUnique.mockResolvedValue({ successorId: null });
      prisma.membership.findUnique.mockResolvedValue({
        role: 'VIEWER',
        status: 'ACTIVE',
      });

      await expect(service.update('t1', { successorId: 'u3' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.tree.update).not.toHaveBeenCalled();
    });

    it('records the nomination with its date', async () => {
      prisma.tree.findUnique.mockResolvedValue({ successorId: null });
      prisma.membership.findUnique.mockResolvedValue({
        role: 'CONTRIBUTOR',
        status: 'ACTIVE',
      });

      await service.update('t1', { successorId: 'u3' });

      const data = callArgs<{
        data: {
          successorId: string;
          successorNominatedAt: Date | null | undefined;
        };
      }>(prisma.tree.update).data;
      expect(data.successorId).toBe('u3');
      expect(data.successorNominatedAt).toBeInstanceOf(Date);
    });

    it('keeps the original date when the same person is nominated again', async () => {
      prisma.tree.findUnique.mockResolvedValue({ successorId: 'u3' });
      prisma.membership.findUnique.mockResolvedValue({
        role: 'CONTRIBUTOR',
        status: 'ACTIVE',
      });

      await service.update('t1', { successorId: 'u3' });

      const data = callArgs<{
        data: {
          successorNominatedAt: Date | null | undefined;
        };
      }>(prisma.tree.update).data;
      expect(data.successorNominatedAt).toBeUndefined();
    });

    it('clears the date with the id when the nomination is withdrawn', async () => {
      await service.update('t1', { successorId: null });

      const data = callArgs<{
        data: {
          successorId: null;
          successorNominatedAt: null;
        };
      }>(prisma.tree.update).data;
      expect(data.successorId).toBeNull();
      expect(data.successorNominatedAt).toBeNull();
    });

    it('leaves the nomination date alone when a rename is all that changed', async () => {
      /* The bug this catches: an `undefined` that was written as `null`
         would erase the date on every rename, and nothing in the UI would
         ever show it — the nomination would silently become "never made". */
      await service.update('t1', { name: 'Mango family, part two' });

      const data = callArgs<{
        data: {
          successorNominatedAt: Date | null | undefined;
        };
      }>(prisma.tree.update).data;
      expect(data.successorNominatedAt).toBeUndefined();
    });
  });

  describe('answering a nomination (FR-9.2)', () => {
    it('is 409 when nothing is waiting', async () => {
      prisma.tree.findUnique.mockResolvedValue({
        id: 't1',
        ownerId: 'u1',
        successorId: null,
      });

      await expect(service.acceptSuccessor('t1', 'u2')).rejects.toThrow(
        ConflictException,
      );
    });

    it('is 403 when the nomination names somebody else', async () => {
      prisma.tree.findUnique.mockResolvedValue({
        id: 't1',
        ownerId: 'u1',
        successorId: 'u3',
      });

      await expect(service.acceptSuccessor('t1', 'u2')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('is 404 when the tree is not there', async () => {
      prisma.tree.findUnique.mockResolvedValue(null);

      await expect(service.acceptSuccessor('nope', 'u2')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('moves ownership, demotes the old owner and records the transfer together', async () => {
      prisma.tree.findUnique.mockResolvedValue({
        id: 't1',
        ownerId: 'u1',
        successorId: 'u2',
      });

      await service.acceptSuccessor('t1', 'u2');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      const treeUpdate = callArgs<{
        data: Record<string, unknown>;
      }>(prisma.tx.tree.update);
      expect(treeUpdate.data.ownerId).toBe('u2');
      expect(treeUpdate.data.previousOwnerId).toBe('u1');
      expect(treeUpdate.data.ownershipTransferredAt).toBeInstanceOf(Date);
      expect(treeUpdate.data.successorId).toBeNull();
      expect(treeUpdate.data.successorNominatedAt).toBeNull();

      /* The successor is OWNER… */
      expect(prisma.tx.membership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { treeId_userId: { treeId: 't1', userId: 'u2' } },
          data: { role: 'OWNER', status: 'ACTIVE' },
        }),
      );

      /* …and the person who handed over stays a member, demoted (FR-9.2).
         `updateMany` rather than `update`: a missing row must not fail the
         whole transaction on a tree whose owner row predates this API. */
      expect(prisma.tx.membership.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { treeId: 't1', userId: 'u1' },
          data: { role: 'CONTRIBUTOR' },
        }),
      );
    });

    it('declines without touching ownership', async () => {
      prisma.tree.findUnique.mockResolvedValue({
        id: 't1',
        ownerId: 'u1',
        successorId: 'u2',
      });

      await service.declineSuccessor('t1', 'u2');

      const data = callArgs<{
        data: {
          successorId: null;
          successorNominatedAt: null;
          ownerId?: string;
        };
      }>(prisma.tree.update).data;
      expect(data.successorId).toBeNull();
      expect(data.successorNominatedAt).toBeNull();
      expect(data.ownerId).toBeUndefined();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('listing what is waiting on me (FR-9.1)', () => {
    it('asks for exactly the trees that nominated this account', async () => {
      await service.successorships('u2');

      expect(prisma.tree.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { successorId: 'u2', successorNominatedAt: { not: null } },
        }),
      );
    });

    it('returns nothing rather than throwing when nobody is waiting', async () => {
      await expect(service.successorships('u2')).resolves.toEqual([]);
    });
  });
});
