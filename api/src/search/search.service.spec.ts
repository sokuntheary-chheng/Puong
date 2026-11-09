import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { SearchQueryDto } from './dto/search.dto';
import { SearchService } from './search.service';

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
 * The stretch feature — search, filter and pagination (FR-7).
 *
 * A fake Prisma rather than the real one: what is under test is the *rules*
 * (what counts as a match, which filter narrows what, whose page size
 * applies), and those are decided before any SQL runs. The queries
 * themselves are asserted only where the rule is *in* the query — FR-6.6's
 * privacy filter is one of those, and it is checked as carefully as any
 * result, because a memory list that forgets it leaks on the first row.
 */
interface Person {
  id: string;
  fullName: string;
  nickname: string | null;
  bio: string | null;
  isLiving: boolean;
}

interface Relation {
  fromId: string;
  toId: string;
  type: string;
}

interface Memory {
  id: string;
  title: string;
  body: string;
  visibility: string;
  authorId: string;
}

const PEOPLE: Person[] = [
  {
    id: 'p1',
    fullName: 'Sokunthéary Chheng',
    nickname: 'theary',
    bio: null,
    isLiving: true,
  },
  {
    id: 'p2',
    fullName: 'Dara Chheng',
    nickname: null,
    bio: 'Founder of the mango grove',
    isLiving: false,
  },
  {
    id: 'p3',
    fullName: 'Sreyneang Chan',
    nickname: null,
    bio: null,
    isLiving: true,
  },
  {
    id: 'p4',
    fullName: 'Vannak Chheng',
    nickname: null,
    bio: null,
    isLiving: true,
  },
];

const RELATIONS: Relation[] = [
  { fromId: 'p1', toId: 'p3', type: 'SPOUSE' },
  { fromId: 'p2', toId: 'p4', type: 'PARENT' },
];

const MEMORIES: Memory[] = [
  {
    id: 'm1',
    title: 'The wedding',
    body: '1978',
    visibility: 'TREE',
    authorId: 'u1',
  },
  {
    id: 'm2',
    title: 'A private note',
    body: 'not for everyone',
    visibility: 'PRIVATE',
    authorId: 'u1',
  },
];

function makePrisma() {
  return {
    tree: { findUnique: jest.fn().mockResolvedValue({ id: 't1' }) },
    person: { findMany: jest.fn().mockResolvedValue(PEOPLE) },
    relation: {
      findMany: jest
        .fn()
        .mockImplementation(
          (args: { where: { treeId: string; type?: string } }) =>
            Promise.resolve(
              args.where.type === undefined
                ? RELATIONS
                : RELATIONS.filter((r) => r.type === args.where.type),
            ),
        ),
    },
    memory: { findMany: jest.fn().mockResolvedValue(MEMORIES) },
  };
}

function query(overrides: Partial<SearchQueryDto> = {}): SearchQueryDto {
  return { q: '', ...overrides };
}

describe('SearchService (FR-7)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: SearchService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new SearchService(prisma as unknown as PrismaService);
  });

  it('answers an empty search with an empty page instead of everything', async () => {
    const page = await service.search('t1', query(), 'u1');

    expect(page).toEqual({
      items: [],
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 0,
    });
    expect(prisma.person.findMany).not.toHaveBeenCalled();
    expect(prisma.memory.findMany).not.toHaveBeenCalled();
  });

  it('pages 10 at a time by default (FR-7.3)', async () => {
    const page = await service.search('t1', query({ q: 'chheng' }), 'u1');

    expect(page.pageSize).toBe(10);
    expect(page.totalPages).toBe(1);
  });

  it('matches names without regard to case or accents (FR-7.1)', async () => {
    const lower = await service.search('t1', query({ q: 'sokun' }), 'u1');
    expect(lower.items.map((i) => i.person?.id)).toEqual(['p1']);

    /* `theary` typed without the accent must still find `Sokunthéary`. */
    const unaccented = await service.search('t1', query({ q: 'THEARY' }), 'u1');
    expect(unaccented.items.map((i) => i.person?.id)).toEqual(['p1']);
  });

  it('filters people by living status (FR-7.2)', async () => {
    const living = await service.search('t1', query({ living: true }), 'u1');
    expect(living.items.map((i) => i.person?.id)).toEqual(['p1', 'p3', 'p4']);

    const deceased = await service.search('t1', query({ living: false }), 'u1');
    expect(deceased.items.map((i) => i.person?.id)).toEqual(['p2']);
  });

  it('keeps both ends of a relation when filtering by its type (FR-7.2)', async () => {
    /* A spouse pair is stored once; keeping only the `fromId` would show
       half of every marriage. */
    const page = await service.search(
      't1',
      query({ relation: 'SPOUSE' as SearchQueryDto['relation'] }),
      'u1',
    );
    expect(page.items.map((i) => i.person?.id)).toEqual(['p1', 'p3']);
  });

  it('filters people by the generation FR-5.6 places them in (FR-7.2)', async () => {
    /* p1 → p4 makes p4 generation 1; everybody else has no parent. */
    prisma.relation.findMany.mockResolvedValue([
      { fromId: 'p1', toId: 'p4', type: 'PARENT' },
    ]);

    const page = await service.search('t1', query({ generation: 1 }), 'u1');
    expect(page.items.map((i) => i.person?.id)).toEqual(['p4']);

    const roots = await service.search('t1', query({ generation: 0 }), 'u1');
    expect(roots.items.map((i) => i.person?.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('answers a filtered request with people only, and refuses a filter aimed at memories', async () => {
    const page = await service.search('t1', query({ living: true }), 'u1');
    expect(page.items.every((i) => i.kind === 'person')).toBe(true);
    /* The memory query is not even issued — a memory has no generation. */
    expect(prisma.memory.findMany).not.toHaveBeenCalled();

    await expect(
      service.search('t1', query({ living: true, kind: 'memories' }), 'u1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('never returns somebody else’s private memory (FR-6.6)', async () => {
    await service.search('t1', query({ q: 'private' }), 'u2');

    expect(prisma.memory.findMany).toHaveBeenCalledTimes(1);
    const where = callArgs<{
      where: {
        OR: unknown[];
      };
    }>(prisma.memory.findMany).where;
    expect(where.OR).toEqual([{ visibility: 'TREE' }, { authorId: 'u2' }]);
  });
});
