import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MemoryVisibility, RelationType } from '@prisma/client';
import { computeGenerations } from '../common/generations';
import { PrismaService } from '../prisma/prisma.service';
import type {
  PageDto,
  SearchQueryDto,
  SearchResultDto,
} from './dto/search.dto';

/** FR-7.3 — 10 per page, capped at 50 by the DTO. */
const DEFAULT_PAGE_SIZE = 10;

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search, filter and paginate the people and memories of one tree — the
   * stretch feature of M0, finished in M4.
   *
   * **Matching happens in memory, not in SQL.** Two reasons, and the first is
   * correctness: the requirement is accent-insensitive matching — `theary`
   * must find `Theary` and `sokun` must find `Sokunthéary` — and PostgreSQL
   * only folds diacritics with the `unaccent` extension, while `ILIKE` on a
   * prefiltered subset silently *misses* the accented rows a broader scan
   * would find. A prefilter that is wrong in one direction is worse than a
   * scan that is right.
   *
   * The second reason is scale: this is one family's tree. The people and
   * memories of a single tree are counted in hundreds, not millions, and the
   * same fold-then-compare function is what the M1 mock did — so the API
   * and the prototype answer identically, which is what makes M3 a transport
   * swap rather than a behaviour change.
   *
   * **FR-7.2's three filters** narrow people: by relation type (either end
   * of a relation of that type), by living status, and by the generation the
   * FR-5.6 rule places them in — which needs the relations, so this loads
   * them only when a filter that needs them was asked for. A filtered request
   * is answered with people only: a memory has no generation and no
   * relatives, so including one under `generation=2` would be a lie, and
   * silently *dropping* the filter to keep memories in would be a second.
   *
   * An empty `q` with no filter is still no search at all — the view shows
   * its empty state rather than every row in the family.
   *
   * FR-6.6 is applied before matching, for the same reason the memory list
   * applies it: a private memory must not become visible by being searched
   * for.
   */
  async search(
    treeId: string,
    query: SearchQueryDto,
    viewerId: string,
  ): Promise<PageDto> {
    const tree = await this.prisma.tree.findUnique({
      where: { id: treeId },
      select: { id: true },
    });
    if (tree === null) {
      throw new NotFoundException(`tree ${treeId} was not found.`);
    }

    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const needle = query.q.trim();
    const filtering =
      query.relation !== undefined ||
      query.living !== undefined ||
      query.generation !== undefined;

    if (filtering && query.kind === 'memories') {
      /* Refused rather than quietly widened: the caller asked for memories
         *and* a filter that only people have, and answering with people is
         the kind of surprising success that becomes a bug report. */
      throw new BadRequestException(
        'relation, living and generation filter people — send kind=people or leave it out.',
      );
    }

    // An empty query with no filter is not an error and not a
    // match-everything: it is no search at all, and the view shows its
    // empty state.
    if (needle === '' && !filtering) {
      return { items: [], page: 1, pageSize, total: 0, totalPages: 0 };
    }

    const results: SearchResultDto[] = [];

    if (query.kind !== 'memories') {
      const people = await this.prisma.person.findMany({
        where: { treeId },
        orderBy: { fullName: 'asc' },
      });

      const connectedTo = await this.connectedIds(treeId, query.relation);
      const generation = await this.generationMap(treeId, query.generation);

      for (const person of people) {
        if (
          needle !== '' &&
          !(
            matches(person.fullName, needle) ||
            matches(person.nickname ?? '', needle) ||
            matches(person.bio ?? '', needle)
          )
        ) {
          continue;
        }
        if (connectedTo !== null && !connectedTo.has(person.id)) continue;
        if (query.living !== undefined && person.isLiving !== query.living) {
          continue;
        }
        if (
          generation !== null &&
          generation.get(person.id) !== query.generation
        ) {
          continue;
        }
        results.push({ kind: 'person', person });
      }
    }

    if (query.kind !== 'people' && !filtering) {
      const memories = await this.prisma.memory.findMany({
        where: {
          treeId,
          ...(query.visibility === undefined
            ? {}
            : { visibility: query.visibility }),
          /* FR-6.6 without a switch: `viewerId` is the session's account,
             so a search can never be made to see a private memory by
             claiming to be its author — M2's `?viewerId=` is gone. */
          OR: [{ visibility: MemoryVisibility.TREE }, { authorId: viewerId }],
        },
        orderBy: { createdAt: 'desc' },
      });
      for (const memory of memories) {
        if (matches(memory.title, needle) || matches(memory.body, needle)) {
          results.push({ kind: 'memory', memory });
        }
      }
    }

    const total = results.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    // A page past the end is clamped to the last page rather than answered
    // with a 404: paging is a view of a list that may have shrunk since the
    // link was made, and a dead link to page 7 should still show something.
    const page = Math.min(
      Math.max(1, query.page ?? 1),
      Math.max(1, totalPages),
    );
    const start = (page - 1) * pageSize;

    return {
      items: results.slice(start, start + pageSize),
      page,
      pageSize,
      total,
      totalPages,
    };
  }

  /**
   * FR-7.2, `relation` — the ids of everybody standing in a relation of that
   * type, **at either end**.
   *
   * Either end is what makes one filter work for all four types: `SPOUSE`
   * and `SIBLING` are stored once and read from both sides, so keeping only
   * the `fromId` would show one half of every married couple. `PARENT` keeps
   * both the parent and the child, because the filter's question is "who is
   * part of a parent–child link", not "who is a parent" — the second one is
   * answered by the generation filter, one column over.
   *
   * Returns `null` for "no relation filter", which is how the caller knows
   * not to apply one without a second flag to check.
   */
  private async connectedIds(
    treeId: string,
    relation: RelationType | undefined,
  ): Promise<Set<string> | null> {
    if (relation === undefined) return null;

    const rows = await this.prisma.relation.findMany({
      where: { treeId, type: relation },
      select: { fromId: true, toId: true },
    });

    const ids = new Set<string>();
    for (const row of rows) {
      ids.add(row.fromId);
      ids.add(row.toId);
    }
    return ids;
  }

  /**
   * FR-7.2, `generation` — the FR-5.6 placement, computed here rather than
   * stored, so a filter can never disagree with the column the tree view
   * draws (there is no generation column to fall behind).
   *
   * `null` means "no generation filter" — same convention as `connectedIds`,
   * and for the same reason: `generation: 0` is a real answer, so the absence
   * of the filter cannot be encoded as `0`.
   */
  private async generationMap(
    treeId: string,
    generation: number | undefined,
  ): Promise<Map<string, number> | null> {
    if (generation === undefined) return null;

    const [people, relations] = await Promise.all([
      this.prisma.person.findMany({ where: { treeId }, select: { id: true } }),
      this.prisma.relation.findMany({
        where: { treeId },
        select: { fromId: true, toId: true, type: true },
      }),
    ]);

    return computeGenerations(people, relations);
  }
}

/**
 * Case- and accent-insensitive substring match.
 *
 * `normalize('NFD')` splits `é` into `e` + a combining accent, and the
 * Unicode-aware regex throws the accent away — the same two steps the mock
 * takes, so a Vietnamese name typed on a keyboard without diacritics is
 * found by either implementation.
 */
function normalise(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function matches(haystack: string, needle: string): boolean {
  return normalise(haystack).includes(normalise(needle));
}
