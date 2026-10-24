#!/usr/bin/env node
/**
 * Seed-data check for M1 item 2.
 *
 * Implements the generation rule from docs/design.md §1.3 exactly, applies it
 * to src/mock/db.json, and fails if the people land anywhere other than where
 * the seed says they should. It also checks referential integrity, because a
 * relation pointing at a person in another tree is invisible until the tree is
 * drawn and is far cheaper to catch here.
 *
 * Run with: npm run check:seed
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const db = JSON.parse(
  readFileSync(join(here, '..', 'src', 'mock', 'db.json'), 'utf8'),
);

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.error(`  FAIL  ${message}`);
};
const pass = (message) => console.log(`  ok    ${message}`);

/* ------------------------------------------------------------------ */
/* 1. Referential integrity                                            */
/* ------------------------------------------------------------------ */

console.log('\nreferential integrity');

const ids = new Set();
for (const [table, rows] of Object.entries(db)) {
  for (const row of rows) {
    if (ids.has(row.id)) fail(`duplicate id ${row.id} in ${table}`);
    ids.add(row.id);
  }
}
pass(`no duplicate ids across ${Object.keys(db).length} tables`);

const personById = new Map(db.people.map((p) => [p.id, p]));
const treeIds = new Set(db.trees.map((t) => t.id));
const userIds = new Set(db.users.map((u) => u.id));

for (const p of db.people) {
  if (!treeIds.has(p.treeId)) fail(`person ${p.id} has unknown treeId ${p.treeId}`);
  if (!userIds.has(p.createdById)) fail(`person ${p.id} has unknown createdById ${p.createdById}`);
}
pass(`all ${db.people.length} people resolve to a tree and a creator`);

for (const r of db.relations) {
  const from = personById.get(r.fromId);
  const to = personById.get(r.toId);
  if (!from || !to) fail(`relation ${r.id} points at a person who does not exist`);
  else if (from.treeId !== to.treeId || from.treeId !== r.treeId) {
    fail(`relation ${r.id} crosses trees (${from.treeId}, ${to.treeId}, ${r.treeId})`);
  }
  if (r.fromId === r.toId) fail(`relation ${r.id} is a self-link`);
}
pass(`all ${db.relations.length} relations stay inside one tree`);

for (const m of db.memories) {
  if (!treeIds.has(m.treeId)) fail(`memory ${m.id} has unknown treeId`);
  if (!personById.has(m.personId)) fail(`memory ${m.id} has unknown personId`);
  if (!userIds.has(m.authorId)) fail(`memory ${m.id} has unknown authorId`);
}
pass(`all ${db.memories.length} memories resolve`);

for (const mb of db.memberships) {
  if (!treeIds.has(mb.treeId)) fail(`membership ${mb.id} has unknown treeId`);
  if (!userIds.has(mb.userId)) fail(`membership ${mb.id} has unknown userId`);
}
pass(`all ${db.memberships.length} memberships resolve`);

for (const t of db.trees) {
  if (!userIds.has(t.ownerId)) fail(`tree ${t.id} has unknown ownerId`);
  if (t.successorId !== null && !userIds.has(t.successorId)) {
    fail(`tree ${t.id} has unknown successorId`);
  }
}
pass(`both trees resolve to a real owner`);

/* ------------------------------------------------------------------ */
/* 2. The generation rule from docs/design.md §1.3                     */
/* ------------------------------------------------------------------ */

/**
 * Step 1  initialise — a person with no PARENT relation starts at 0,
 *                         anyone with parents is unplaced.
 * Step 2a place      — one generation below the HIGHEST of their parents,
 *                      once every parent is placed.
 * Step 2b raise      — a parentless person catches up with the highest
 *                      generation among their SPOUSE/SIBLING/FRIEND links.
 * Repeats 2a and 2b until neither changes anything.
 * Step 3  anyone still unplaced is 0.
 */
function computeGenerations(people, relations) {
  const parentsByChild = new Map();
  const linksByPerson = new Map();

  for (const r of relations) {
    if (r.type === 'PARENT') {
      const list = parentsByChild.get(r.toId) ?? [];
      list.push(r.fromId);
      parentsByChild.set(r.toId, list);
    } else {
      for (const end of [r.fromId, r.toId]) {
        const other = end === r.fromId ? r.toId : r.fromId;
        const list = linksByPerson.get(end) ?? [];
        list.push(other);
        linksByPerson.set(end, list);
      }
    }
  }

  const gen = new Map();
  for (const p of people) {
    if (!parentsByChild.has(p.id)) gen.set(p.id, 0); // step 1
  }

  let passCount = 0;
  for (;;) {
    passCount += 1;
    let changed = false;

    for (const p of people) {
      if (gen.has(p.id)) continue;
      const parents = parentsByChild.get(p.id) ?? [];
      if (parents.every((q) => gen.has(q))) {
        gen.set(p.id, 1 + Math.max(...parents.map((q) => gen.get(q)))); // step 2(a)
        changed = true;
      }
    }

    for (const p of people) {
      if (parentsByChild.has(p.id)) continue;
      const placed = (linksByPerson.get(p.id) ?? [])
        .filter((q) => gen.has(q))
        .map((q) => gen.get(q));
      if (placed.length > 0 && Math.max(...placed) > gen.get(p.id)) {
        gen.set(p.id, Math.max(...placed)); // step 2(b)
        changed = true;
      }
    }

    if (!changed) break;
  }

  for (const p of people) if (!gen.has(p.id)) gen.set(p.id, 0); // step 3

  return { gen, passes: passCount };
}

console.log('\ngeneration placement (design.md §1.3)');

const { gen, passes } = computeGenerations(
  db.people.filter((p) => p.treeId === 't1'),
  db.relations.filter((r) => r.treeId === 't1'),
);

/* The layout the seed claims to produce. */
const expected = {
  0: ['p01', 'p02'],
  1: ['p03', 'p04', 'p05', 'p06', 'p07', 'p08'],
  2: ['p09', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15', 'p16', 'p17'],
  3: ['p18', 'p19', 'p20', 'p21', 'p22'],
};

const actual = {};
for (const [id, g] of gen) {
  (actual[g] ??= []).push(id);
}
for (const g of Object.keys(actual)) actual[g].sort();

for (const [generation, members] of Object.entries(expected)) {
  const got = actual[generation] ?? [];
  const want = [...members].sort();
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail(`generation ${generation}: expected ${want.join(',')}, got ${got.join(',')}`);
  } else {
    pass(`generation ${generation} = ${got.join(', ')}`);
  }
}
pass(`stable after ${passes} pass(es) of the step 2(a)/2(b) loop`);

/* Why this rule and not the obvious one. A first-touch breadth-first search is
   the natural implementation and is wrong: it reaches a child of a parentless
   in-law through her at depth 1 and stops, putting the child beside their own
   father. Run it and confirm it disagrees, so this seed keeps the bug
   detectable if the rule is ever reverted. */
function firstTouchBfs(people, relations) {
  const parentsByChild = new Map();
  const childrenByParent = new Map();
  for (const r of relations) {
    if (r.type !== 'PARENT') continue;
    if (!parentsByChild.has(r.toId)) parentsByChild.set(r.toId, []);
    parentsByChild.get(r.toId).push(r.fromId);
    if (!childrenByParent.has(r.fromId)) childrenByParent.set(r.fromId, []);
    childrenByParent.get(r.fromId).push(r.toId);
  }
  const g = new Map();
  const queue = people.filter((p) => !parentsByChild.has(p.id)).map((p) => p.id);
  for (const id of queue) g.set(id, 0);
  while (queue.length > 0) {
    const id = queue.shift();
    for (const child of childrenByParent.get(id) ?? []) {
      if (!g.has(child)) {
        g.set(child, g.get(id) + 1);
        queue.push(child);
      }
    }
  }
  return g;
}

const naive = firstTouchBfs(
  db.people.filter((p) => p.treeId === 't1'),
  db.relations.filter((r) => r.treeId === 't1'),
);
const disagrees = [...gen].filter(([id, g]) => naive.get(id) !== g);
if (disagrees.length === 0) {
  fail('the seed does not distinguish the corrected rule from first-touch BFS — the bug it was written to catch is now invisible');
} else {
  pass(
    `first-touch BFS would misplace ${disagrees.length} person(s), e.g. ${disagrees
      .slice(0, 3)
      .map(([id, g]) => `${id} (correct ${g}, BFS ${naive.get(id)})`)
      .join(', ')}`,
  );
}

/* The property the rule exists to guarantee. */
for (const r of db.relations.filter((x) => x.type === 'PARENT')) {
  if (!(gen.get(r.fromId) < gen.get(r.toId))) {
    fail(`parent ${r.fromId} (gen ${gen.get(r.fromId)}) is not above child ${r.toId} (gen ${gen.get(r.toId)})`);
  }
}
pass('every parent sits in a strictly earlier generation than their child');

/* ------------------------------------------------------------------ */
/* 3. The data the M1 states depend on                                 */
/* ------------------------------------------------------------------ */

console.log('\nM1 fixtures');

const t1People = db.people.filter((p) => p.treeId === 't1');
/* FR-4.3 — complete = full name AND birth date AND (photograph OR biography). */
const isComplete = (p) =>
  p.fullName.trim() !== '' &&
  p.birthDate !== null &&
  (p.photoUrl !== null || p.bio !== null);

const incomplete = t1People.filter((p) => !isComplete(p)).map((p) => p.id);
const complete = t1People.filter((p) => isComplete(p)).map((p) => p.id);
if (incomplete.length === 0) fail('no deliberately incomplete profile — FR-4.3 has nothing to derive');
else pass(`incomplete profiles: ${incomplete.join(', ')} (derived, FR-4.3)`);
if (complete.length === 0) fail('no complete profile — FR-4.3 has nothing to contrast against');
else pass(`complete profiles: ${complete.length} of ${t1People.length}`);

/* Each way of being incomplete should occur at least once, or the rule is
   only being tested on one of its three conditions. */
const missingBirth = t1People.filter((p) => p.birthDate === null).map((p) => p.id);
const noPhotoNoBio = t1People
  .filter((p) => p.birthDate !== null && p.photoUrl === null && p.bio === null)
  .map((p) => p.id);
if (missingBirth.length === 0) fail('no profile missing a birth date — one branch of FR-4.3 untested');
else pass(`missing birth date: ${missingBirth.join(', ')}`);
if (noPhotoNoBio.length === 0) fail('no profile with neither photo nor biography — other branch untested');
else pass(`no photo and no biography: ${noPhotoNoBio.join(', ')}`);

const deceased = t1People.filter((p) => !p.isLiving).map((p) => p.id);
if (deceased.length === 0) fail('no deceased person — the age-at-death check has nothing to test');
else pass(`deceased: ${deceased.join(', ')} (age at death, FR-4.3)`);

const undated = db.memories.filter((m) => m.happenedAt === null).map((m) => m.id);
if (undated.length === 0) fail('no undated memory — FR-6.3 has nothing to test');
else pass(`undated memories: ${undated.join(', ')} (FR-6.3)`);

const privateMm = db.memories.filter((m) => m.visibility === 'PRIVATE').map((m) => m.id);
if (privateMm.length === 0) fail('no PRIVATE memory — FR-6.8 has nothing to test');
else pass(`private memories: ${privateMm.join(', ')} (FR-6.8)`);

const treeRoles = new Set(
  db.memberships.filter((m) => m.treeId === 't1').map((m) => m.role),
);
for (const role of ['OWNER', 'CONTRIBUTOR', 'VIEWER']) {
  if (!treeRoles.has(role)) fail(`t1 has no ${role} — the permission matrix has nobody to test`);
}
pass('t1 has one active member of each role');

const invited = db.memberships.filter((m) => m.status === 'INVITED');
if (invited.length === 0) fail('no INVITED membership — FR-2.3 has nothing to test');
else pass(`invited membership: ${invited.map((m) => `${m.userId}@${m.treeId}`).join(', ')} (FR-2.3)`);

const emptyTree = db.trees.find((t) => !db.people.some((p) => p.treeId === t.id));
if (!emptyTree) fail('no empty tree — FR-8.4 has nothing to show');
else pass(`empty tree: "${emptyTree.name}" (FR-8.4)`);

const authored = new Set(db.people.map((p) => p.createdById));
if (authored.size < 2) fail('one person created everything — the FR-6.5 "you can edit" branch is unreachable');
else pass(`people created by ${authored.size} different members (FR-6.5)`);

/* ------------------------------------------------------------------ */

console.log(
  `\n${failures === 0 ? 'seed check passed' : `seed check FAILED: ${failures} problem(s)`}\n`,
);
process.exit(failures === 0 ? 0 : 1);
