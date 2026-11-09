import type {
  Invitation,
  Memory,
  MemoryVisibility,
  Membership,
  Person,
  Relation,
  RelationType,
  Role,
  SuccessorInfo,
  Successorship,
  Tree,
  User,
} from '../types';

/**
 * The application's only network code: every screen goes through here.
 *
 * This replaces the M1 mock, and the shape of it is the point of the change:
 *
 * - **One base path, `/api`.** Same origin as the page in production (nginx
 *   proxies `/api/` to the API), and the same path in development behind the
 *   Vite proxy — so the code has one thing to say about where the API is, and
 *   the `httpOnly` session cookie is first-party in both.
 * - **No token anywhere in this file.** The session is a cookie the browser
 *   attaches by itself; `credentials: 'same-origin'` says so out loud, and
 *   there is no `Authorization` header for script to fill in or to steal.
 * - **One error type.** The API answers every failure with
 *   `{ statusCode, message: string[], error }`, so every failure arrives
 *   here as an `ApiError` carrying the status and a sentence a view can
 *   render. A screen never has to parse a response body to find out what
 *   went wrong.
 */

/** Base path of the API. Never a full URL: the cookie is same-origin. */
const BASE = '/api';

/**
 * A request that failed, in the only shape a view has to understand.
 *
 * `status` is what a caller branches on — `404` for "gone", `401` for
 * "signed out", `403` for "your role is not enough" — and `message` is the
 * sentence `AsyncState` shows. A transport failure (no server at all) has
 * `status` 0, because it is not an HTTP answer and pretending otherwise
 * would send a view looking for a status the server never sent.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly messages: string[];

  constructor(status: number, messages: string[]) {
    super(messages.length > 0 ? messages.join(' ') : `Request failed (${status}).`);
    this.name = 'ApiError';
    this.status = status;
    this.messages = messages;
  }
}

/* ------------------------------------------------------------------ */
/* Request                                                             */
/* ------------------------------------------------------------------ */

/**
 * Endpoints the demo controls can be armed against, so the M1 error state
 * stays demonstrable now that failures are no longer manufactured by a mock.
 *
 * The arm is *client-side and honest*: it throws before the request is made
 * and says so in the message. Nothing pretends the server failed.
 */
const failOnce = new Set<string>();

export const demo = {
  /** Make the next call tagged with `endpoint` throw instead of fetching. */
  failNext(endpoint: string): void {
    failOnce.add(endpoint);
  },

  /** Disarm anything the demo controls armed. */
  clearFailures(): void {
    failOnce.clear();
  },
};

/** Called when the API answers 401, so the session can drop its user. */
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

interface RequestOptions {
  /** Tag for `demo.failNext`. */
  endpoint: string;
  body?: unknown;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  { endpoint, body }: RequestOptions,
): Promise<T> {
  if (failOnce.delete(endpoint)) {
    throw new ApiError(0, [
      'This request was stopped in the browser, from the demo controls, so the error state could be shown. Nothing was sent.',
    ]);
  }

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      /* The session is a same-origin cookie. `same-origin` rather than
         `include`: there is no cross-origin call to make, and a broader
         grant would only widen where the cookie can travel. */
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, [
      'Could not reach the API. Is it running?',
    ]);
  }

  /* 401 first, before the body is read: the session is gone (expired cookie,
     signed out elsewhere), and the store should stop presenting a user that
     the server no longer recognises. */
  if (response.status === 401) onUnauthorized?.();

  if (!response.ok) throw await toApiError(response);

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  let messages: string[] = [];
  try {
    const body = (await response.json()) as { message?: unknown };
    if (Array.isArray(body.message)) {
      messages = body.message.filter((m): m is string => typeof m === 'string');
    } else if (typeof body.message === 'string') {
      messages = [body.message];
    }
  } catch {
    /* Not JSON — a proxy or a crash page. Fall through to the status. */
  }

  if (messages.length === 0) {
    messages = [`Request failed with status ${response.status}.`];
  }
  return new ApiError(response.status, messages);
}

/* ------------------------------------------------------------------ */
/* Session — how you get a cookie, and how you lose one                */
/* ------------------------------------------------------------------ */

export interface Credentials {
  email: string;
  password: string;
}

export interface NewAccount extends Credentials {
  displayName: string;
}

/**
 * Registration. The answer is the account; the session arrives as an
 * `httpOnly` cookie that this code cannot read — which is exactly the
 * storage choice MILESTONES.md defends.
 */
export function register(account: NewAccount): Promise<User> {
  return request<{ user: User }>('POST', '/auth/register', {
    endpoint: 'auth.register',
    body: account,
  }).then((result) => result.user);
}

export function login(credentials: Credentials): Promise<User> {
  return request<{ user: User }>('POST', '/auth/login', {
    endpoint: 'auth.login',
    body: credentials,
  }).then((result) => result.user);
}

export function logout(): Promise<void> {
  return request<void>('POST', '/auth/logout', { endpoint: 'auth.logout' });
}

/** Who the cookie says we are, re-read from the database. 401 when nobody. */
export function me(): Promise<User> {
  return request<User>('GET', '/auth/me', { endpoint: 'auth.me' });
}

/**
 * The accounts that exist, for turning a `userId` into a name.
 *
 * A membership record knows an id and nothing else, and the owner picking a
 * successor has to recognise the person they are picking — a list of ids
 * would be a decision made blind. The email comes back with it, but nothing
 * on this screen renders it: the name is the whole point of the call.
 */
export function listUsers(): Promise<User[]> {
  return request<User[]>('GET', '/users', { endpoint: 'users.list' });
}

/* ------------------------------------------------------------------ */
/* Trees                                                               */
/* ------------------------------------------------------------------ */

/** FR-1.2 — my trees. The caller is the session; there is no id to pass. */
export function listTrees(): Promise<Tree[]> {
  return request<Tree[]>('GET', '/trees', { endpoint: 'trees.list' });
}

/** FR-2.1 — create a tree; the API makes me its OWNER. */
export function createTree(input: {
  name: string;
  description?: string;
}): Promise<Tree> {
  return request<Tree>('POST', '/trees', { endpoint: 'trees.create', body: input });
}

export function getTree(treeId: string): Promise<Tree> {
  return request<Tree>('GET', `/trees/${treeId}`, { endpoint: 'trees.get' });
}

/**
 * FR-2.4 — rename or redraw a tree, and FR-9.1 — nominate a successor (or
 * `null` to withdraw one). Only an OWNER's call reaches the API.
 */
export function updateTree(
  treeId: string,
  input: {
    name?: string;
    description?: string;
    coverPhotoUrl?: string | null;
    successorId?: string | null;
  },
): Promise<Tree> {
  return request<Tree>('PATCH', `/trees/${treeId}`, {
    endpoint: 'trees.update',
    body: input,
  });
}

/** FR-2.4 — delete the tree and everything hanging off it. OWNER only. */
export function deleteTree(treeId: string): Promise<void> {
  return request<void>('DELETE', `/trees/${treeId}`, { endpoint: 'trees.delete' });
}

/* ------------------------------------------------------------------ */
/* Memberships — the only place a role exists                          */
/* ------------------------------------------------------------------ */

export function listMemberships(treeId: string): Promise<Membership[]> {
  return request<Membership[]>('GET', `/trees/${treeId}/members`, {
    endpoint: 'memberships.list',
  });
}

/**
 * My role in one tree, or `null` when I am not a member of it.
 *
 * `null` is a real answer rather than an error: the API answers 404 for a
 * tree you are not an ACTIVE member of (FR-2.5), and "you are not a member"
 * is precisely what this function was asked.
 */
export async function getMyRole(
  treeId: string,
  userId: string,
): Promise<Membership | null> {
  try {
    return await request<Membership>('GET', `/trees/${treeId}/members/${userId}`, {
      endpoint: 'memberships.mine',
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* Invitations — FR-3                                                  */
/* ------------------------------------------------------------------ */

/**
 * FR-3.2 — the invitations waiting on *my* answer.
 *
 * The API already applies FR-3.4 here: an invitation whose seven days ran
 * out is not in this list at all, so the home page never offers a button
 * that is guaranteed to fail.
 */
export function listInvitations(): Promise<Invitation[]> {
  return request<Invitation[]>('GET', '/memberships/mine', {
    endpoint: 'memberships.invitations',
  });
}

/** FR-3.3 — accept my own invitation; the tree joins my list afterwards. */
export function acceptInvitation(membershipId: string): Promise<Membership> {
  return request<Membership>('PATCH', `/memberships/${membershipId}`, {
    endpoint: 'memberships.accept',
    body: { status: 'ACTIVE' },
  });
}

/** FR-3.3 — decline it instead, which sets the membership to `REVOKED`. */
export function declineInvitation(membershipId: string): Promise<Membership> {
  return request<Membership>('PATCH', `/memberships/${membershipId}`, {
    endpoint: 'memberships.decline',
    body: { status: 'REVOKED' },
  });
}

/** FR-3.1 — invite an existing account to a tree by address. */
export function inviteMember(
  treeId: string,
  input: { email: string; role: Role },
): Promise<Membership> {
  return request<Membership>('POST', `/trees/${treeId}/members`, {
    endpoint: 'memberships.invite',
    body: input,
  });
}

/* ------------------------------------------------------------------ */
/* Succession — FR-9                                                   */
/* ------------------------------------------------------------------ */

/** FR-9.1 — who owns this tree, who is nominated, and when it moved. */
export function getSuccessor(treeId: string): Promise<SuccessorInfo> {
  return request<SuccessorInfo>('GET', `/trees/${treeId}/successor`, {
    endpoint: 'successor.get',
  });
}

/** FR-9.1 — the nominations waiting for *my* answer, across every tree. */
export function listSuccessorships(): Promise<Successorship[]> {
  return request<Successorship[]>('GET', '/successorships', {
    endpoint: 'successorships.list',
  });
}

/** FR-9.2 — the nominee accepts; ownership moves in one transaction. */
export function acceptSuccessor(treeId: string): Promise<SuccessorInfo> {
  return request<SuccessorInfo>('POST', `/trees/${treeId}/successor/accept`, {
    endpoint: 'successor.accept',
  });
}

/** FR-9.2 — the nominee declines, and the nomination is withdrawn. */
export function declineSuccessor(treeId: string): Promise<SuccessorInfo> {
  return request<SuccessorInfo>('POST', `/trees/${treeId}/successor/decline`, {
    endpoint: 'successor.decline',
  });
}

/* ------------------------------------------------------------------ */
/* People and relations                                                */
/* ------------------------------------------------------------------ */

export function listPeople(treeId: string): Promise<Person[]> {
  return request<Person[]>('GET', `/trees/${treeId}/people`, { endpoint: 'people.list' });
}

export function getPerson(treeId: string, personId: string): Promise<Person> {
  return request<Person>('GET', `/trees/${treeId}/people/${personId}`, {
    endpoint: 'people.get',
  });
}

export function listRelations(treeId: string): Promise<Relation[]> {
  return request<Relation[]>('GET', `/trees/${treeId}/relations`, {
    endpoint: 'relations.list',
  });
}

/**
 * FR-4.1 — the fields a form may send when it adds or edits a person.
 *
 * `createdById` is absent on purpose, exactly as in the DTO: the API reads
 * the author from the session, so there is no field here to fill in with
 * somebody else's name. `''` is accepted for a cleared date and turned into
 * `null` by the API's `@Transform`.
 */
export interface PersonInput {
  fullName: string;
  nickname?: string;
  gender?: Person['gender'];
  birthDate?: string | null;
  deathDate?: string | null;
  isLiving?: boolean;
  photoUrl?: string | null;
  bio?: string;
}

/** FR-4.1 — add a person to a tree. CONTRIBUTOR and above. */
export function createPerson(treeId: string, input: PersonInput): Promise<Person> {
  return request<Person>('POST', `/trees/${treeId}/people`, {
    endpoint: 'people.create',
    body: input,
  });
}

/** FR-4.4 — edit one; 403 unless it is mine or I own the tree. */
export function updatePerson(
  treeId: string,
  personId: string,
  input: Partial<PersonInput>,
): Promise<Person> {
  return request<Person>('PATCH', `/trees/${treeId}/people/${personId}`, {
    endpoint: 'people.update',
    body: input,
  });
}

/** FR-4.6 — delete one, with its relations and memories. */
export function deletePerson(treeId: string, personId: string): Promise<void> {
  return request<void>('DELETE', `/trees/${treeId}/people/${personId}`, {
    endpoint: 'people.delete',
  });
}

/** FR-5.1 — link two people of the same tree. */
export function createRelation(
  treeId: string,
  input: { fromId: string; toId: string; type: RelationType },
): Promise<Relation> {
  return request<Relation>('POST', `/trees/${treeId}/relations`, {
    endpoint: 'relations.create',
    body: input,
  });
}

/** FR-5.5 — unlink. A relation has no editable field, so this is the edit. */
export function deleteRelation(treeId: string, relationId: string): Promise<void> {
  return request<void>('DELETE', `/trees/${treeId}/relations/${relationId}`, {
    endpoint: 'relations.delete',
  });
}

/* ------------------------------------------------------------------ */
/* Memories                                                            */
/* ------------------------------------------------------------------ */

export interface ListMemoriesOptions {
  personId?: string;
}

/**
 * FR-6.7 — the order memories are listed in: newest occurred date first.
 *
 * Undated memories sort last. They have no point in the timeline to sort
 * against, and floating them to top would bury the dated ones.
 *
 * Exported because the store inserts a freshly written memory into the list
 * it is already holding; if that insertion sorted differently from this, the
 * list would look right until the next refetch rearranged it. (The API sorts
 * the same way — `nulls: 'last'` on `happenedAt` — so the two agree.)
 */
export function compareMemoriesByDate(a: Memory, b: Memory): number {
  if (a.happenedAt === null && b.happenedAt === null) return 0;
  if (a.happenedAt === null) return 1;
  if (b.happenedAt === null) return -1;
  if (a.happenedAt === b.happenedAt) return b.createdAt.localeCompare(a.createdAt);
  return b.happenedAt.localeCompare(a.happenedAt);
}

/**
 * Lists a person's memories, or the whole tree's.
 *
 * FR-6.6 is the *server's* rule and is applied there: there is no viewer to
 * send, so there is no viewer to lie about. A `PRIVATE` memory that is not
 * mine simply does not come back.
 */
export function listMemories(
  treeId: string,
  options: ListMemoriesOptions = {},
): Promise<Memory[]> {
  const query = options.personId === undefined ? '' : `?personId=${encodeURIComponent(options.personId)}`;
  return request<Memory[]>('GET', `/trees/${treeId}/memories${query}`, {
    endpoint: 'memories.list',
  });
}

export interface CreateMemoryInput {
  treeId: string;
  personId: string;
  title: string;
  body: string;
  /** Empty string when the author left the date blank; the API stores null. */
  happenedAt: string;
  visibility: MemoryVisibility;
  photoUrl?: string | null;
}

/**
 * Writes a memory. There is no `authorId`: the API reads the writer from
 * the session, so a memory cannot be attributed to somebody else from here.
 */
export function createMemory(input: CreateMemoryInput): Promise<Memory> {
  const { treeId, ...body } = input;
  return request<Memory>('POST', `/trees/${treeId}/memories`, {
    endpoint: 'memories.create',
    body,
  });
}

/**
 * FR-6.4 — edit a memory. 403 unless I wrote it (FR-6.5).
 *
 * `treeId` is a path parameter, not a field: it is omitted from the body
 * type rather than stripped from the body, so a caller cannot send the tree
 * they are looking at as if it were a field of the memory.
 */
export function updateMemory(
  treeId: string,
  memoryId: string,
  input: Partial<Omit<CreateMemoryInput, 'treeId'>>,
): Promise<Memory> {
  return request<Memory>('PATCH', `/trees/${treeId}/memories/${memoryId}`, {
    endpoint: 'memories.update',
    body: input,
  });
}

/** FR-6.4 / FR-6.8 — delete a memory I wrote, or any TREE one as owner. */
export function deleteMemory(treeId: string, memoryId: string): Promise<void> {
  return request<void>('DELETE', `/trees/${treeId}/memories/${memoryId}`, {
    endpoint: 'memories.delete',
  });
}

/* ------------------------------------------------------------------ */
/* Photographs — FR-6.2, FR-6.3                                        */
/* ------------------------------------------------------------------ */

export interface UploadedPhoto {
  url: string;
  filename: string;
  sizeBytes: number;
}

/**
 * FR-6.2 — send one file to the upload route and get back its url.
 *
 * This is the one call in the file that is not JSON: `request()` sets a
 * `content-type` header on purpose, and setting that by hand on a `FormData`
 * body would break the multipart boundary the browser is about to write.
 * Everything else — the same-origin credentials, the 401 handler, the one
 * error type — is deliberately identical, so a view cannot tell the two
 * apart except by the payload it gets back.
 */
export async function uploadPhoto(file: File): Promise<UploadedPhoto> {
  const form = new FormData();
  form.append('file', file, file.name);

  let response: Response;
  try {
    response = await fetch(`${BASE}/uploads/photos`, {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
    });
  } catch {
    throw new ApiError(0, ['Could not reach the API. Is it running?']);
  }

  if (response.status === 401) onUnauthorized?.();
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as UploadedPhoto;
}

/* ------------------------------------------------------------------ */
/* Search — the stretch feature                                        */
/* ------------------------------------------------------------------ */

/**
 * FR-7.3 — ten results a page.
 *
 * The number is shared with the API's `DEFAULT_PAGE_SIZE`, because a page
 * size the client assumes and the page size the server applies have to agree
 * for `totalPages` to mean anything: if the client rendered "page 2 of 3"
 * from six-per-page arithmetic over a ten-per-page answer, the last page
 * would appear to have results it does not have.
 */
export const SEARCH_PAGE_SIZE = 10;

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type SearchResult =
  | { kind: 'person'; person: Person }
  | { kind: 'memory'; memory: Memory };

export interface SearchInput {
  treeId: string;
  query: string;
  page: number;
  pageSize?: number;
  /** Restrict to one kind of result. */
  kind?: 'people' | 'memories';
  /** `TREE` narrows to shared memories; omit for everything I may see. */
  visibility?: MemoryVisibility;
  /**
   * FR-7.2 — the people filters. All three are people-only: a memory has no
   * generation and no living status, so combining any of them with
   * `kind: 'memories'` is answered 400 by the API rather than silently
   * ignored (a filter that quietly does nothing is worse than no filter).
   *
   * `living` is a real `boolean`, not a string, because the interesting bug
   * here is `living: 'false'` being truthy — the form sends the word, this
   * function converts it, and nothing downstream ever sees a string.
   */
  living?: boolean;
  /** The generation the family rule (FR-5.6) places a person in. */
  generation?: number;
  /** Only people taking part in a relation of this type, both ends kept. */
  relation?: RelationType;
}

/** The wire shape: tagged, with one of the two payloads present. */
interface SearchHit {
  kind: 'person' | 'memory';
  person?: Person;
  memory?: Memory;
}

/**
 * Searches people and memories in one tree, paginated, accent- and
 * case-insensitively (the API folds diacritics, so `theary` finds
 * `Sokunthéary`).
 *
 * FR-6.6 applies here exactly as it does to listing: a private memory is a
 * hit only for its author, and the author is the cookie, not a parameter.
 */
export async function search(input: SearchInput): Promise<Page<SearchResult>> {
  const params = new URLSearchParams({
    q: input.query,
    page: String(input.page),
    pageSize: String(input.pageSize ?? SEARCH_PAGE_SIZE),
  });
  if (input.kind !== undefined) params.set('kind', input.kind);
  if (input.visibility !== undefined) params.set('visibility', input.visibility);
  if (input.living !== undefined) params.set('living', String(input.living));
  if (input.generation !== undefined) {
    params.set('generation', String(input.generation));
  }
  if (input.relation !== undefined) params.set('relation', input.relation);

  const page = await request<Page<SearchHit>>(
    'GET',
    `/trees/${input.treeId}/search?${params.toString()}`,
    { endpoint: 'search' },
  );

  return {
    ...page,
    items: page.items.map((hit) =>
      hit.kind === 'person'
        ? { kind: 'person' as const, person: hit.person as Person }
        : { kind: 'memory' as const, memory: hit.memory as Memory },
    ),
  };
}
