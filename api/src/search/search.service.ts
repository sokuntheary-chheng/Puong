import { Injectable, NotFoundException } from '@nestjs/common';
import { MemoryVisibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  PageDto,
  SearchQueryDto,
  SearchResultDto,
} from './dto/search.dto';

/** The mock's page size (`SEARCH_PAGE_SIZE`), so both agree on what a page is. */
const DEFAULT_PAGE_SIZE = 6;

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search people and memories in one tree, paginated (the stretch feature).
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
   * FR-6.6 is applied before matching, for the same reason the memory list
   * applies it: a private memory must not become visible by being searched
   * for.
   */
  async search(treeId: string, query: SearchQueryDto): Promise<PageDto> {
    const tree = await this.prisma.tree.findUnique({
      where: { id: treeId },
      select: { id: true },
    });
    if (tree === null) {
      throw new NotFoundException(`tree ${treeId} was not found.`);
    }

    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const needle = query.q.trim();

    // An empty query is not an error and not a match-everything: it is no
    // search at all, and the view shows its empty state.
    if (needle === '') {
      return { items: [], page: 1, pageSize, total: 0, totalPages: 0 };
    }

    const results: SearchResultDto[] = [];

    if (query.kind !== 'memories') {
      const people = await this.prisma.person.findMany({
        where: { treeId },
        orderBy: { fullName: 'asc' },
      });
      for (const person of people) {
        if (
          matches(person.fullName, needle) ||
          matches(person.nickname ?? '', needle) ||
          matches(person.bio ?? '', needle)
        ) {
          results.push({ kind: 'person', person });
        }
      }
    }

    if (query.kind !== 'people') {
      const memories = await this.prisma.memory.findMany({
        where: {
          treeId,
          ...(query.visibility === undefined
            ? {}
            : { visibility: query.visibility }),
          ...(query.viewerId === undefined
            ? {}
            : {
                OR: [
                  { visibility: MemoryVisibility.TREE },
                  { authorId: query.viewerId },
                ],
              }),
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
