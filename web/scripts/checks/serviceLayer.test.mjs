/**
 * Checks for the M1 service layer and the generation rule.
 *
 * mockApi's latency is turned off here: the delay exists so that a browser
 * can show a loading state, and it would only make these assertions slow.
 */

import {
  NotFoundError,
  compareMemoriesByDate,
  createMemory,
  getMyRole,
  getTree,
  listMemories,
  listPeople,
  listRelations,
  mockApi,
  search,
} from '../../.checks/svc.mjs';
import { computeGenerations, groupByGeneration } from '../../.checks/gen.mjs';

const problems = [];

function check(ok, label, detail = '') {
  if (ok) console.log(`  ok    ${label}`);
  else problems.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

mockApi.setLatency(0);

/* ---------- FR-6.6: a PRIVATE memory is its author's alone ---------- */

const asOwner = (await listMemories('t1', { viewerId: 'u1' })).map((m) => m.id);
const asContributor = (await listMemories('t1', { viewerId: 'u2' })).map((m) => m.id);
const asViewer = (await listMemories('t1', { viewerId: 'u3' })).map((m) => m.id);

check(asOwner.includes('mm3'), 'the author sees their own PRIVATE memory');
check(
  !asContributor.includes('mm3') && !asViewer.includes('mm3'),
  'nobody else sees it — not even an owner',
);
check(asContributor.includes('mm4'), 'the second author sees their own PRIVATE memory');
check(!asOwner.includes('mm4'), 'the owner does not see the contributor’s private memory');
check(
  !asViewer.includes('mm3') && !asViewer.includes('mm4'),
  'a viewer sees no PRIVATE memory at all',
);
check(asViewer.includes('mm1') && asViewer.includes('mm5'), 'a viewer still sees TREE memories');
check(asOwner.length === 5, 'the owner sees five of the six memories', `got ${asOwner.length}`);
check(asViewer.length === 4, 'a viewer sees the four TREE memories', `got ${asViewer.length}`);

/* ---------- FR-6.7: newest first, undated last ---------- */

const visible = await listMemories('t1', { viewerId: 'u1' });
const order = visible.map((m) => m.id);
const dates = visible.filter((m) => m.happenedAt !== null).map((m) => m.happenedAt);

check(
  JSON.stringify(dates) === JSON.stringify([...dates].sort().reverse()),
  'dated memories are newest first',
  JSON.stringify(dates),
);
check(order.at(-1) === 'mm5', 'the undated memory sorts last, not first', JSON.stringify(order));
/* mm4 is PRIVATE and the contributor's, so the owner sees four dated
   memories rather than five — the count is itself a FR-6.6 assertion. */
check(
  visible.filter((m) => m.happenedAt !== null).length === 4,
  'the owner sees four dated memories',
);

const resorted = [...visible].reverse().sort(compareMemoriesByDate);
check(
  JSON.stringify(resorted.map((m) => m.id)) === JSON.stringify(order),
  'the exported comparator reproduces the service order from a shuffled list',
);

/* ---------- search: accent-insensitive ---------- */

const r1 = await search({ treeId: 't1', query: 'hoi an', page: 1, viewerId: 'u1' });
check(r1.total > 0, '"hoi an" matches "Hội An …" without the diacritic', `total ${r1.total}`);

const r2 = await search({ treeId: 't1', query: 'HOI AN', page: 1, viewerId: 'u1' });
check(
  r2.items.some((x) => x.kind === 'person' && x.person.fullName === 'Mr. Mango'),
  'an all-caps query without diacritics finds the exact person',
);

const r3 = await search({ treeId: 't1', query: 'workshop', page: 1, viewerId: 'u1' });
check(
  r3.items.some((x) => x.kind === 'memory' && x.memory.id === 'mm5'),
  'a query matching memory body text finds the memory',
);

/* ---------- search cannot reach what FR-6.6 hides ---------- */

const r4 = await search({ treeId: 't1', query: 'years after 1975', page: 1, viewerId: 'u3' });
check(r4.total === 0, 'a viewer searching a PRIVATE memory title finds nothing');
const r5 = await search({ treeId: 't1', query: 'years after 1975', page: 1, viewerId: 'u1' });
check(
  r5.items.some((x) => x.kind === 'memory' && x.memory.id === 'mm3'),
  'its author searching the same words finds it',
);

/* ---------- pagination ---------- */

const p1 = await search({ treeId: 't1', query: 'an', page: 1, viewerId: 'u1', pageSize: 3 });
check(p1.items.length === 3, 'the page size is honoured', `got ${p1.items.length}`);
check(p1.totalPages === Math.ceil(p1.total / 3), 'totalPages is derived from the total');
const p2 = await search({ treeId: 't1', query: 'an', page: 2, viewerId: 'u1', pageSize: 3 });
check(p2.items.length > 0 && p2.page === 2, 'page 2 returns the next slice');
check(
  p1.items.filter((x) => p2.items.includes(x)).length === 0,
  'consecutive pages do not overlap',
);
const p99 = await search({ treeId: 't1', query: 'an', page: 99, viewerId: 'u1', pageSize: 3 });
check(p99.page === p1.totalPages, 'a page past the end clamps to the last', `got ${p99.page}`);
const blank = await search({ treeId: 't1', query: '   ', page: 1, viewerId: 'u1' });
check(blank.total === 0 && blank.items.length === 0, 'a blank query returns nothing, not everything');

/* ---------- the generation rule agrees with the seed checker ---------- */

const people = await listPeople('t1');
const relations = await listRelations('t1');

const expected = {
  0: ['p01', 'p02', 'p23'],
  1: ['p03', 'p04', 'p05', 'p06', 'p07', 'p08'],
  2: ['p09', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15', 'p16', 'p17'],
  3: ['p18', 'p19', 'p20', 'p21', 'p22'],
};

const generation = computeGenerations(people, relations);
let placementAgrees = true;
for (const [g, members] of Object.entries(expected)) {
  const got = people.filter((p) => generation.get(p.id) === Number(g)).map((p) => p.id).sort();
  const want = [...members].sort();
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    placementAgrees = false;
    problems.push(`generation ${g}: expected ${want.join(',')} — got ${got.join(',')}`);
  }
}
check(
  placementAgrees,
  'the application places people exactly where scripts/check-generations.mjs expects',
);

const columns = groupByGeneration(people, relations);
check(
  columns.map((c) => c.generation).join(',') === '0,1,2,3',
  'columns come out oldest first',
  columns.map((c) => c.generation).join(','),
);
check(
  columns.reduce((n, c) => n + c.people.length, 0) === 23,
  'every person appears in exactly one column',
);
check(
  columns[0].people.some((p) => p.id === 'p23'),
  'the unlinked person lands in generation 0, where the tree flags her as not linked yet',
);
check(
  relations
    .filter((r) => r.type === 'PARENT')
    .every((r) => (generation.get(r.fromId) ?? 0) < (generation.get(r.toId) ?? 0)),
  'every parent is in a strictly earlier generation than their child',
);

/* ---------- roles ---------- */

check((await getMyRole('t1', 'u1'))?.role === 'OWNER', 'the owner is OWNER of t1');
check((await getMyRole('t1', 'u3'))?.role === 'VIEWER', 'the viewer is VIEWER of t1');
check(
  (await getMyRole('t2', 'u3')) === null,
  'an INVITED membership grants no role — FR-2.3 returns 404',
);

/* ---------- missing records ---------- */

try {
  await getTree('nope');
  check(false, 'a missing tree should throw');
} catch (error) {
  check(
    error instanceof NotFoundError,
    'a missing tree throws NotFoundError rather than a generic failure',
  );
}

/* ---------- writing ---------- */

const written = await createMemory({
  treeId: 't1',
  personId: 'p01',
  authorId: 'u1',
  title: '  A new record  ',
  body: '  Written with surrounding space.  ',
  happenedAt: '',
  visibility: 'TREE',
});
check(written.title === 'A new record', 'the title is trimmed on write');
check(written.body === 'Written with surrounding space.', 'the body is trimmed on write');
check(
  written.happenedAt === null,
  'a blank date is stored as null rather than as an empty string every reader must special-case',
);
check(written.id === 'mm7', 'the new id continues the seed sequence', written.id);

check(
  (await listMemories('t1', { viewerId: 'u3' })).some((m) => m.id === 'mm7'),
  'a TREE memory written after seeding is visible to a viewer',
);

try {
  await createMemory({
    treeId: 't1',
    personId: 'p99',
    authorId: 'u1',
    title: 'x',
    body: 'y',
    happenedAt: '',
    visibility: 'TREE',
  });
  check(false, 'writing for a person who does not exist should throw');
} catch (error) {
  check(
    error instanceof NotFoundError,
    'writing for a missing person throws NotFoundError',
  );
}

if (problems.length > 0) {
  console.error('\n  service layer FAILED:');
  for (const p of problems) console.error(`  FAIL  ${p}`);
  process.exit(1);
}
