import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { RelationsService } from './relations.service';

/**
 * Story 5 / FR-5 — the three checks a unique index cannot make.
 *
 * The duplicate-link case is deliberately absent: that one *is* a constraint
 * (`@@unique([treeId, fromId, toId, type])`), and testing it here would be
 * testing PostgreSQL through a mock. What is tested is the part that has no
 * constraint behind it — the graph.
 */
function makePrisma() {
  return {
    tree: {
      findUnique: jest.fn().mockResolvedValue({ id: 't1' }),
    },
    person: {
      findFirst: jest
        .fn()
        .mockImplementation((args: { where: { id: string; treeId: string } }) =>
          Promise.resolve(
            args.where.treeId === 't1' && args.where.id !== 'stranger'
              ? { id: args.where.id }
              : null,
          ),
        ),
    },
    relation: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockImplementation((args: { data: unknown }) =>
          Promise.resolve({ id: 'r1', ...(args.data as object) }),
        ),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe('RelationsService (FR-5)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: RelationsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new RelationsService(prisma as unknown as PrismaService);
  });

  it('refuses a link from a person to themselves (FR-5.3 → 400)', async () => {
    await expect(
      service.create('t1', { fromId: 'p1', toId: 'p1', type: 'SPOUSE' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.relation.create).not.toHaveBeenCalled();
  });

  it('refuses a person who is not in this tree (FR-5.1)', async () => {
    await expect(
      service.create('t1', { fromId: 'p1', toId: 'stranger', type: 'PARENT' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.relation.create).not.toHaveBeenCalled();
  });

  it('refuses a parent link that closes the family into a loop (FR-5.4 → 409)', async () => {
    /* `a` is already `b`'s parent, so making `b` `a`'s parent would leave
       the generation pass (FR-5.6) walking forever. */
    prisma.relation.findMany.mockResolvedValue([
      { fromId: 'a', toId: 'b', type: 'PARENT' },
    ]);

    await expect(
      service.create('t1', { fromId: 'b', toId: 'a', type: 'PARENT' }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.relation.create).not.toHaveBeenCalled();
  });

  it('refuses the longer loop too — a great-grandparent made into a child', async () => {
    prisma.relation.findMany.mockResolvedValue([
      { fromId: 'a', toId: 'b', type: 'PARENT' },
      { fromId: 'b', toId: 'c', type: 'PARENT' },
      { fromId: 'c', toId: 'd', type: 'PARENT' },
    ]);

    /* New edge: `d` is `a`'s parent — but `d` is already `a`'s
       great-grandchild, so walking up from `d` reaches `a`. (The reverse
       direction, making `a` `d`'s parent again, is *not* a loop: it is a
       redundant edge, and the service correctly lets it through.) */
    await expect(
      service.create('t1', { fromId: 'd', toId: 'a', type: 'PARENT' }),
    ).rejects.toThrow(ConflictException);
  });

  it('lets an ordinary parent link through and writes the row (FR-5.1)', async () => {
    prisma.relation.findMany.mockResolvedValue([
      { fromId: 'a', toId: 'b', type: 'PARENT' },
    ]);

    const created = await service.create('t1', {
      fromId: 'c',
      toId: 'd',
      type: 'PARENT',
    });

    expect(created).toMatchObject({
      treeId: 't1',
      fromId: 'c',
      toId: 'd',
      type: 'PARENT',
    });
  });

  it('never asks about ancestors for a link that is not a parent link', async () => {
    await service.create('t1', { fromId: 'a', toId: 'b', type: 'FRIEND' });
    expect(prisma.relation.findMany).not.toHaveBeenCalled();
  });

  it('scopes a delete to its tree so an id from another family is a 404', async () => {
    prisma.relation.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.remove('t1', 'r-from-elsewhere')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.relation.deleteMany).toHaveBeenCalledWith({
      where: { id: 'r-from-elsewhere', treeId: 't1' },
    });
  });
});
