import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MemoryVisibility } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { MemoriesService } from './memories.service';

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
 * Story 7 and FR-6.4 – FR-6.8: who may edit and delete whose memory.
 *
 * These rules are the reason `remove` takes a role as well as an actor: the
 * matrix (owner may moderate a *shared* memory, nobody may touch a private
 * one, only the author may edit anything) has three dimensions — authorship,
 * visibility and role — and no single one of them can be checked by a guard
 * that only ever sees the path.
 */
function makePrisma() {
  return {
    tree: { findUnique: jest.fn().mockResolvedValue({ id: 't1' }) },
    person: { findFirst: jest.fn().mockResolvedValue({ id: 'p1' }) },
    memory: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
}

const shared = {
  id: 'm1',
  treeId: 't1',
  personId: 'p1',
  authorId: 'author',
  title: 'The wedding',
  body: '1978',
  visibility: MemoryVisibility.TREE,
};

const secret = { ...shared, id: 'm2', visibility: MemoryVisibility.PRIVATE };

describe('MemoriesService (FR-6)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: MemoriesService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new MemoriesService(prisma as unknown as PrismaService);
  });

  describe('reading (FR-6.6)', () => {
    it('asks for shared memories plus the caller’s own private ones', async () => {
      await service.list('t1', { viewerId: 'reader' });

      const where = callArgs<{
        where: {
          OR: unknown[];
        };
      }>(prisma.memory.findMany).where;
      expect(where.OR).toEqual([
        { visibility: MemoryVisibility.TREE },
        { authorId: 'reader' },
      ]);
    });

    it('hides somebody else’s private memory as 404, not 403', async () => {
      /* 403 would confirm the id exists — which is the one thing the read
         is keeping secret. */
      prisma.memory.findFirst.mockResolvedValue(secret);

      await expect(service.get('t1', 'm2', 'somebody-else')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns a private memory to its author', async () => {
      prisma.memory.findFirst.mockResolvedValue(secret);

      await expect(service.get('t1', 'm2', 'author')).resolves.toMatchObject({
        id: 'm2',
      });
    });
  });

  describe('editing (FR-6.4, FR-6.5)', () => {
    it('is 403 when the caller is not the author — an owner included', async () => {
      prisma.memory.findFirst.mockResolvedValue(shared);

      await expect(
        service.update('t1', 'm1', { title: 'Rewritten' }, 'the-owner'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.memory.update).not.toHaveBeenCalled();
    });

    it('lets the author correct their own memory', async () => {
      prisma.memory.findFirst.mockResolvedValue(shared);
      prisma.memory.update.mockResolvedValue({
        ...shared,
        title: 'Corrected',
      });

      const result = await service.update(
        't1',
        'm1',
        { title: 'Corrected' },
        'author',
      );

      expect(result.title).toBe('Corrected');
    });
  });

  describe('deleting (FR-6.8)', () => {
    it('lets the author delete their own memory', async () => {
      prisma.memory.findFirst.mockResolvedValue(shared);

      await expect(
        service.remove('t1', 'm1', 'author', 'CONTRIBUTOR'),
      ).resolves.toBeUndefined();
      expect(prisma.memory.delete).toHaveBeenCalledWith({
        where: { id: 'm1' },
      });
    });

    it('refuses a contributor who tries to delete somebody else’s shared memory', async () => {
      prisma.memory.findFirst.mockResolvedValue(shared);

      await expect(
        service.remove('t1', 'm1', 'contributor', 'CONTRIBUTOR'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.memory.delete).not.toHaveBeenCalled();
    });

    it('lets the owner moderate a shared memory somebody else wrote', async () => {
      prisma.memory.findFirst.mockResolvedValue(shared);

      await expect(
        service.remove('t1', 'm1', 'owner', 'OWNER'),
      ).resolves.toBeUndefined();
      expect(prisma.memory.delete).toHaveBeenCalled();
    });

    it('refuses the owner from deleting somebody else’s PRIVATE memory — 404, because they cannot see it', async () => {
      prisma.memory.findFirst.mockResolvedValue(secret);

      await expect(
        service.remove('t1', 'm2', 'owner', 'OWNER'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.memory.delete).not.toHaveBeenCalled();
    });
  });
});
