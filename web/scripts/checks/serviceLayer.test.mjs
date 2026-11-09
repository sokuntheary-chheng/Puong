/**
 * Checks for the M3 service layer — the real HTTP client.
 *
 * The service is tested by standing a fake API in front of `fetch`: the
 * client's whole job is *what it asks for and what it does with the answer*,
 * and both of those are observable at that seam without a server, a network
 * or a database. The contract it is checked against is the one the API's own
 * harness (`api/scripts/check-api.cjs`) enforces from the other side:
 * `{ statusCode, message: string[], error }` bodies, 204 for a deletion,
 * and a session that exists only as a cookie.
 *
 * Two properties get more attention than the rest, because they are the M3
 * changes rather than plumbing:
 *
 * 1. **No identity in the request.** Every call is checked for the absence
 *    of `viewerId`, `authorId`, `createdById`, `ownerId` and any form of
 *    token — the server reads those from the cookie, and a client that sent
 *    them would be the escalation path the API refuses.
 * 2. **Failures arrive as one thing.** Whatever the server does — a validation
 *    array, an empty 500, a dead network — the caller sees an `ApiError` with
 *    a status and a sentence.
 */

import {
  ApiError,
  SEARCH_PAGE_SIZE,
  compareMemoriesByDate,
  createMemory,
  createTree,
  demo,
  getMyRole,
  listMemories,
  listPeople,
  listTrees,
  login,
  logout,
  register,
  search,
  setUnauthorizedHandler,
} from '../../.checks/svc.mjs';
import { computeGenerations, groupByGeneration } from '../../.checks/gen.mjs';

const problems = [];
let passed = 0;

function check(ok, label, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ok    ${label}`);
  } else {
    problems.push(`${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/* ------------------------------------------------------------------ */
/* The fake API                                                        */
/* ------------------------------------------------------------------ */

/** Every request the client has made since the last reset. */
let calls = [];

/** What the fake API answers with; set per section below. */
let answer = () => {
  throw new Error('the fake API was asked before it was configured');
};

function serve(handler) {
  answer = handler;
}

globalThis.fetch = async (url, init) => {
  const call = { url: String(url), init };
  calls.push(call);
  return answer(call, init);
};

function http(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new Error('no body on a 204');
      return body;
    },
  };
}

const lastCall = () => calls[calls.length - 1];
const bodyOf = (call) => JSON.parse(call.init.body);

async function rejects(promise, label) {
  try {
    await promise;
    check(false, label, 'resolved, but should have thrown');
    return null;
  } catch (error) {
    return error;
  }
}

/* ------------------------------------------------------------------ */
/* FR-6.7 — the order a memory list is sorted in                       */
/* ------------------------------------------------------------------ */

const mem = (id, happenedAt, createdAt) => ({ id, happenedAt, createdAt });

check(
  [mem('a', '2020-01-01', 't1'), mem('b', '1999-05-04', 't2')]
    .sort(compareMemoriesByDate)
    .map((m) => m.id)
    .join(',') === 'a,b',
  'newer memories come first',
);

check(
  [mem('undated', null, 't9'), mem('dated', '1990-01-01', 't8')]
    .sort(compareMemoriesByDate)
    .map((m) => m.id)
    .join(',') === 'dated,undated',
  'undated memories sort last (nulls last, as the API sorts them)',
);

check(
  [mem('a', '2020-01-01', '2026-01-02'), mem('b', '2020-01-01', '2026-01-01')]
    .sort(compareMemoriesByDate)
    .map((m) => m.id)
    .join(',') === 'a,b',
  'the same date falls back to the newest write',
);

/* ------------------------------------------------------------------ */
/* Session — how you get a cookie                                      */
/* ------------------------------------------------------------------ */

serve(() =>
  http(200, {
    user: { id: 'u9', email: 'new@puong.dev', displayName: 'New Member', createdAt: 'now' },
  }),
);

const registered = await register({
  email: 'new@puong.dev',
  displayName: 'New Member',
  password: 'Passw0rd!',
});

check(registered.id === 'u9', 'register returns the account, not a token');
check(
  lastCall().url === '/api/auth/register' &&
    lastCall().init.method === 'POST' &&
    lastCall().init.credentials === 'same-origin',
  'register is a same-origin POST — the cookie is what carries the session',
);
check(
  !('token' in bodyOf(lastCall())) && !('passwordHash' in registered),
  'no token and no password hash in the request or the answer',
);

serve(() => http(200, { user: { id: 'u1', email: 'owner@puong.dev', displayName: 'A Owner', createdAt: 'now' } }));

const signedIn = await login({ email: 'owner@puong.dev', password: 'Passw0rd!' });
check(signedIn.id === 'u1', 'login returns the account');

const loginCall = lastCall();
check(
  Object.keys(bodyOf(loginCall)).sort().join(',') === 'email,password',
  'the login body is exactly the two fields the form collected',
);
check(
  loginCall.init.headers['content-type'] === 'application/json' &&
    loginCall.init.headers.Authorization === undefined,
  'the JSON body is announced, and there is no Authorization header to forge',
);

let unauthorized = 0;
setUnauthorizedHandler(() => {
  unauthorized += 1;
});

serve(() => http(401, { statusCode: 401, message: ['No session.'], error: 'Unauthorized' }));

const denied = await rejects(login({ email: 'x@y.z', password: 'wrong' }), 'a 401 becomes an ApiError');
check(denied instanceof ApiError && denied.status === 401, 'a 401 arrives as ApiError(401)');
check(unauthorized === 1, 'a 401 tells the session store to drop the user');
check(denied.message === 'No session.', 'the server’s sentence is what the view shows');

serve(() => http(403, { statusCode: 403, message: ['Not your tree.'], error: 'Forbidden' }));
const forbidden = await rejects(listTrees(), 'a 403 becomes an ApiError');
check(forbidden instanceof ApiError && forbidden.status === 403, 'a 403 arrives as ApiError(403)');

serve(() => http(500, undefined));
const bare = await rejects(listTrees(), 'a body-less 500 becomes an ApiError');
check(
  bare instanceof ApiError && bare.status === 500 && /500/.test(bare.message),
  'a 500 with no body still produces a sentence to show',
);

serve(() => {
  throw new Error('ECONNREFUSED');
});
const offline = await rejects(listTrees(), 'a dead API becomes an ApiError');
check(
  offline instanceof ApiError && offline.status === 0 && /Could not reach the API/.test(offline.message),
  'an unreachable API is status 0 — not an HTTP answer the caller should branch on',
);

setUnauthorizedHandler(() => {});

serve(() => http(204, undefined));
await logout();
check(
  lastCall().url === '/api/auth/logout' && lastCall().init.method === 'POST',
  'logout posts to clear the cookie',
);

/* ------------------------------------------------------------------ */
/* The demo control: a failure the browser makes, and admits making    */
/* ------------------------------------------------------------------ */

serve(() => http(200, []));
await listPeople('t1');
const before = calls.length;

demo.failNext('people.list');
const stopped = await rejects(listPeople('t1'), 'an armed failure throws');
check(
  stopped instanceof ApiError && stopped.status === 0 && /stopped in the browser/.test(stopped.message),
  'an armed failure says it was stopped in the browser — it does not pretend the server broke',
);
check(calls.length === before, 'and nothing is sent when it is armed');
demo.clearFailures();

await listPeople('t1');
check(calls.length === before + 1, 'clearing the arm lets the real request through');

/* ------------------------------------------------------------------ */
/* Trees, roles, people, memories — the shapes and the URLs            */
/* ------------------------------------------------------------------ */

serve(() =>
  http(200, [
    { id: 't1', name: 'Mango', description: null, ownerId: 'u1' },
  ]),
);

const trees = await listTrees();
check(trees.length === 1 && lastCall().url === '/api/trees', 'GET /api/trees — the caller is the cookie');

serve(() => http(201, { id: 't9', name: 'New family', description: 'Three generations' }));
await createTree({ name: 'New family', description: 'Three generations' });
const treeBody = bodyOf(lastCall());
check(
  lastCall().url === '/api/trees' && Object.keys(treeBody).sort().join(',') === 'description,name',
  'POST /api/trees carries a name and a description — never an ownerId',
);

serve(() =>
  http(200, { id: 'mb1', treeId: 't1', userId: 'u1', role: 'OWNER', status: 'ACTIVE' }),
);
const membership = await getMyRole('t1', 'u1');
check(membership.role === 'OWNER', 'my role comes back as the membership row');

serve(() => http(404, { statusCode: 404, message: ['Not a member.'], error: 'Not Found' }));
const absent = await getMyRole('t1', 'u1');
check(absent === null, 'not being a member is an answer (null), not an error to render');

serve(() => http(403, { statusCode: 403, message: ['No.'], error: 'Forbidden' }));
const refused = await rejects(getMyRole('t1', 'u1'), 'a 403 is not swallowed');
check(refused instanceof ApiError && refused.status === 403, 'a 403 still throws — only 404 becomes null');

serve(() => http(200, []));
await listMemories('t1', { personId: 'p 01' });
check(
  lastCall().url === '/api/trees/t1/memories?personId=p%2001',
  'a person scope is encoded into the query string',
);

await listMemories('t1');
check(
  lastCall().url === '/api/trees/t1/memories',
  'without a person scope there is no query string — and no viewer to pass',
);

serve(() =>
  http(201, {
    id: 'mm9',
    treeId: 't1',
    personId: 'p01',
    authorId: 'u2',
    title: 'A note',
    body: 'Text',
    happenedAt: null,
    visibility: 'TREE',
  }),
);

const written = await createMemory({
  treeId: 't1',
  personId: 'p01',
  title: 'A note',
  body: 'Text',
  happenedAt: '',
  visibility: 'TREE',
});
const memoryBody = bodyOf(lastCall());
check(
  lastCall().url === '/api/trees/t1/memories' &&
    !('treeId' in memoryBody) &&
    !('authorId' in memoryBody) &&
    !('id' in memoryBody),
  'a memory is posted to its tree, with no authorId — the cookie is the author',
);
check(written.authorId === 'u2', 'and the answer reports the author the server recorded');

/* ------------------------------------------------------------------ */
/* Search — pagination, filters, and how hits come back                */
/* ------------------------------------------------------------------ */

serve(() =>
  http(200, {
    items: [
      { kind: 'person', person: { id: 'p01' }, memory: null },
      { kind: 'memory', memory: { id: 'mm4' }, person: null },
    ],
    page: 2,
    pageSize: SEARCH_PAGE_SIZE,
    total: 13,
    totalPages: 3,
  }),
);

const hits = await search({ treeId: 't1', query: 'theary', page: 2, kind: 'people' });
const searchUrl = lastCall().url;

check(
  searchUrl.includes('q=theary') &&
    searchUrl.includes('page=2') &&
    searchUrl.includes(`pageSize=${SEARCH_PAGE_SIZE}`) &&
    searchUrl.includes('kind=people'),
  'the query, the page, the page size and the kind are all in the URL, so a search is a link',
);

check(
  hits.total === 13 && hits.totalPages === 3 && hits.page === 2,
  'the pager keeps the server’s totals',
);

check(
  hits.items[0].kind === 'person' && hits.items[0].person.id === 'p01' && !('memory' in hits.items[0]),
  'a person hit is tagged and carries only a person',
);
check(
  hits.items[1].kind === 'memory' && hits.items[1].memory.id === 'mm4' && !('person' in hits.items[1]),
  'a memory hit is tagged and carries only a memory',
);

/* ------------------------------------------------------------------ */
/* The M3 property, checked over everything recorded above            */
/* ------------------------------------------------------------------ */

const transcripts = calls.map((call) => {
  const body = call.init.body === undefined ? '' : call.init.body;
  return `${call.url} ${body}`;
});

check(
  transcripts.every((t) => !/viewerId|authorId|createdById|ownerId/.test(t)),
  'no request anywhere names a viewer, an author, a creator or an owner — the cookie does',
);
check(
  transcripts.every((t) => !/token|bearer|authorization/i.test(t)),
  'no request anywhere carries a token, a bearer header or an Authorization header',
);

/* ------------------------------------------------------------------ */
/* The generation rule (unchanged since M1, still what the tree draws)  */
/* ------------------------------------------------------------------ */

const people = [
  { id: 'p1', fullName: 'A', birthDate: '1935-01-01' },
  { id: 'p2', fullName: 'B', birthDate: '1960-01-01' },
  { id: 'p3', fullName: 'C', birthDate: '1985-01-01' },
];
const relations = [
  { id: 'r1', fromId: 'p1', toId: 'p2', type: 'PARENT' },
  { id: 'r2', fromId: 'p2', toId: 'p3', type: 'PARENT' },
];

const generations = computeGenerations(people, relations);
check(
  generations.size === 3 && generations.get('p1') === 0 && generations.get('p3') === 2,
  'three generations from two parent links, oldest first',
);

const grouped = groupByGeneration(people, relations);
check(
  grouped.length === 3 && grouped[0].people[0].id === 'p1',
  'and the tree view can group by them',
);

console.log(`  ${passed} service-layer checks passed`);

if (problems.length > 0) {
  console.error('\n  service layer FAILED:');
  for (const p of problems) console.error(`  FAIL  ${p}`);
  process.exit(1);
}
