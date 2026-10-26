import seed from '../mock/db.json';
import type {
  Database,
  Memory,
  MemoryVisibility,
  Membership,
  Person,
  Relation,
  Tree,
  User,
} from '../mock/types';

/**
 * A stand-in for the M2 API.
 *
 * Every function is asynchronous and takes a measurable amount of time, and
 * every function can be made to fail on demand. Both matter: a mock that
 * resolves synchronously makes the loading state untestable, and one that
 * cannot fail makes the error state unreachable — the two states the M1
 * checklist asks to be visible.
 *
 * Nothing here exposes the underlying object. Stores receive values and
 * cannot reach past the service to mutate the "database", which is how the
 * M2 layer will behave and the reason the store cannot accidentally work
 * when the API would not.
 */

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Thrown for a missing record, so a view can tell "gone" from "failed". */
export class NotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} ${id} was not found.`);
    this.name = 'NotFoundError';
  }
}

let db: Database = clone(seed as Database);

/** How long a request takes. Short enough to click through, long enough to see. */
let latencyMs = 350;

/** Endpoints that should throw once, so the error state can be demonstrated. */
const failOnce = new Set<string>();

export const mockApi = {
  get latency(): number {
    return latencyMs;
  },

  setLatency(ms: number): void {
    latencyMs = ms;
  },

  /** Make the next call to `endpoint` fail, once. Used by the demo controls. */
  failNext(endpoint: string): void {
    failOnce.add(endpoint);
  },

  /** Restore the seed and clear any injected failure. */
  reset(): void {
    db = clone(seed as Database);
    failOnce.clear();
  },
};

/* ------------------------------------------------------------------ */
/* Trees                                                               */
/* ------------------------------------------------------------------ */

/** FR-1.2 — the trees the signed-in member belongs to. */
export async function listTreesForUser(userId: string): Promise<Tree[]> {
  await respond('trees.list');
  const treeIds = new Set(
    db.memberships
      .filter((m) => m.userId === userId && m.status === 'ACTIVE')
      .map((m) => m.treeId),
  );
  return db.trees.filter((t) => treeIds.has(t.id)).map(clone);
}

export async function getTree(treeId: string): Promise<Tree> {
  await respond('trees.get');
  const tree = db.trees.find((t) => t.id === treeId);
  if (!tree) throw new NotFoundError('tree', treeId);
  return clone(tree);
}

/* ------------------------------------------------------------------ */
/* Memberships                                                         */
/* ------------------------------------------------------------------ */

export async function listMemberships(treeId: string): Promise<Membership[]> {
  await respond('memberships.list');
  return db.memberships.filter((m) => m.treeId === treeId).map(clone);
}

/** The signed-in member's role in one tree, or null if they are not a member. */
export async function getMyRole(
  treeId: string,
  userId: string,
): Promise<Membership | null> {
  await respond('memberships.mine');
  const match = db.memberships.find(
    (m) => m.treeId === treeId && m.userId === userId && m.status === 'ACTIVE',
  );
  return match ? clone(match) : null;
}

/* ------------------------------------------------------------------ */
/* People and relations                                                */
/* ------------------------------------------------------------------ */

export async function listPeople(treeId: string): Promise<Person[]> {
  await respond('people.list');
  return db.people.filter((p) => p.treeId === treeId).map(clone);
}

export async function getPerson(
  treeId: string,
  personId: string,
): Promise<Person> {
  await respond('people.get');
  const person = db.people.find((p) => p.treeId === treeId && p.id === personId);
  if (!person) throw new NotFoundError('person', personId);
  return clone(person);
}

export async function listRelations(treeId: string): Promise<Relation[]> {
  await respond('relations.list');
  return db.relations.filter((r) => r.treeId === treeId).map(clone);
}

/* ------------------------------------------------------------------ */
/* Memories                                                            */
/* ------------------------------------------------------------------ */

export interface ListMemoriesOptions {
  personId?: string;
  /** The signed-in member, so that FR-6.6 can be applied here and only here. */
  viewerId?: string;
}

/**
 * FR-6.7 — the order memories are listed in: newest occurred date first.
 *
 * Undated memories sort last. They have no point in the timeline to sort
 * against, and floating them to the top would bury the dated ones.
 *
 * Exported because the store inserts a freshly written memory into the list
 * it is already holding; if that insertion sorted differently from this, the
 * list would look right until the next refetch rearranged it.
 */
export function compareMemoriesByDate(a: Memory, b: Memory): number {
  if (a.happenedAt === null && b.happenedAt === null) return 0;
  if (a.happenedAt === null) return 1;
  if (b.happenedAt === null) return -1;
  if (a.happenedAt === b.happenedAt) return b.createdAt.localeCompare(a.createdAt);
  return b.happenedAt.localeCompare(a.happenedAt);
}

/**
 * Lists a person's memories.
 *
 * FR-6.6 — a `PRIVATE` memory is returned only to its author, including
 * against an owner. Filtering happens in the service rather than in a view,
 * so there is one place where the rule lives and one place to test it.
 */
export async function listMemories(
  treeId: string,
  options: ListMemoriesOptions = {},
): Promise<Memory[]> {
  await respond('memories.list');

  const matches = db.memories.filter((m) => {
    if (m.treeId !== treeId) return false;
    if (options.personId !== undefined && m.personId !== options.personId) {
      return false;
    }
    if (m.visibility === 'PRIVATE' && m.authorId !== options.viewerId) {
      return false;
    }
    return true;
  });

  return matches.slice().sort(compareMemoriesByDate).map(clone);
}

export interface CreateMemoryInput {
  treeId: string;
  personId: string;
  authorId: string;
  title: string;
  body: string;
  /** Empty string when the author left the date blank. */
  happenedAt: string;
  visibility: MemoryVisibility;
  photoUrl?: string | null;
}

/**
 * Writes a memory. The caller has already validated the input in the
 * browser; M2 validates again here, because the browser's word is not
 * trusted (IF-1.7).
 */
export async function createMemory(input: CreateMemoryInput): Promise<Memory> {
  await respond('memories.create');

  const tree = db.trees.find((t) => t.id === input.treeId);
  if (!tree) throw new NotFoundError('tree', input.treeId);
  const person = db.people.find(
    (p) => p.treeId === input.treeId && p.id === input.personId,
  );
  if (!person) throw new NotFoundError('person', input.personId);

  const nextNumber = db.memories.reduce((max, m) => {
    const n = Number(m.id.replace(/^mm/, ''));
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  const memory: Memory = {
    id: `mm${nextNumber + 1}`,
    treeId: input.treeId,
    personId: input.personId,
    authorId: input.authorId,
    title: input.title.trim(),
    body: input.body.trim(),
    /* FR-6.1 — the date is optional, so a blank one is stored as null
       rather than as an empty string that every reader has to special-case. */
    happenedAt: input.happenedAt === '' ? null : input.happenedAt,
    photoUrl: input.photoUrl ?? null,
    visibility: input.visibility,
    createdAt: new Date().toISOString(),
  };

  db.memories.push(memory);
  return clone(memory);
}

/* ------------------------------------------------------------------ */
/* Search — the stretch feature                                        */
/* ------------------------------------------------------------------ */

export const SEARCH_PAGE_SIZE = 6;

export interface SearchInput {
  treeId: string;
  query: string;
  page: number;
  pageSize?: number;
  /** Restrict to one kind of result. */
  kind?: 'people' | 'memories';
  /** The signed-in member, so FR-6.6 can be applied to memory hits. */
  viewerId?: string;
  /** `TREE` narrows to shared memories; omit for everything the viewer may see. */
  visibility?: MemoryVisibility;
}

export type SearchResult =
  | { kind: 'person'; person: Person }
  | { kind: 'memory'; memory: Memory };

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

/**
 * Searches people and memories in one tree, paginated.
 *
 * Matching is accent- and case-insensitive: a Vietnamese name typed on a
 * keyboard without the diacritics must still be found, which is the
 * difference between a search that works for this family and one that does
 * not.
 *
 * FR-6.6 applies here exactly as it does to listing memories — a PRIVATE
 * memory is a hit only for its author, so a search cannot be used to find
 * what the list would not show.
 */
export async function search(input: SearchInput): Promise<Page<SearchResult>> {
  await respond('search');

  const pageSize = input.pageSize ?? SEARCH_PAGE_SIZE;
  const query = input.query.trim();

  if (query === '') {
    return { items: [], page: 1, pageSize, total: 0, totalPages: 0 };
  }

  const people: SearchResult[] =
    input.kind === 'memories'
      ? []
      : db.people
          .filter(
            (p) =>
              p.treeId === input.treeId &&
              (matches(p.fullName, query) ||
                (p.nickname !== null && matches(p.nickname, query)) ||
                (p.bio !== null && matches(p.bio, query))),
          )
          .map((person) => ({ kind: 'person' as const, person }));

  const memories: SearchResult[] =
    input.kind === 'people'
      ? []
      : db.memories
          .filter(
            (m) =>
              m.treeId === input.treeId &&
              (m.visibility !== 'PRIVATE' || m.authorId === input.viewerId) &&
              (input.visibility === undefined || m.visibility === input.visibility) &&
              (matches(m.title, query) || matches(m.body, query)),
          )
          .map((memory) => ({ kind: 'memory' as const, memory }));

  const results = [...people, ...memories];

  const total = results.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const page = Math.min(Math.max(1, input.page), Math.max(1, totalPages));
  const start = (page - 1) * pageSize;

  return {
    items: results.slice(start, start + pageSize).map(clone),
    page,
    pageSize,
    total,
    totalPages,
  };
}

/** Users, for the "who wrote this" line on a memory. */
export async function listUsers(): Promise<User[]> {
  await respond('users.list');
  return db.users.map(clone);
}

/* ------------------------------------------------------------------ */

async function respond(endpoint: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, latencyMs));
  if (failOnce.delete(endpoint)) {
    throw new Error(`The ${endpoint} request failed. This failure was requested, to show the error state.`);
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
