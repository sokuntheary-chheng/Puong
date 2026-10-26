/**
 * M2 verification: every endpoint, every status code, one error shape.
 *
 * Run it against a *seeded* database with the API already listening:
 *
 *   npm run seed          # restore the demo family — this script writes
 *   npm run start:dev     # data as it goes, so a second run in a row
 *   npm run check         # fails on the rows the first run created
 *
 * It is a script rather than a jest suite because it needs the real server,
 * the real database and the real status codes; the unit/e2e suites in
 * `npm test` cover the parts that do not. `process.exitCode` is set to 1 on
 * any failure, so it is usable in CI.
 */
const BASE = process.env.API_BASE || 'http://localhost:3000';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    pass += 1;
  } else {
    fail += 1;
    failures.push(`${name}${detail === undefined ? '' : ` → ${JSON.stringify(detail)}`}`);
  }
}

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text === '' ? null : JSON.parse(text);
  } catch {
    json = { __unparsed: text };
  }
  return { status: res.status, body: json, raw: text };
}

function isErrorBody(res, status) {
  return (
    res.body !== null &&
    res.body.statusCode === status &&
    typeof res.body.error === 'string' &&
    Array.isArray(res.body.message) &&
    res.body.message.length > 0 &&
    res.body.message.every((m) => typeof m === 'string')
  );
}

async function main() {
  /* ---------------------------------------------------------------- users */
  let r = await call('GET', '/api/users');
  check('GET /api/users → 200', r.status === 200, r.status);
  check('GET /api/users → 3 accounts', Array.isArray(r.body) && r.body.length === 3, r.body);
  check(
    'GET /api/users → no passwordHash anywhere',
    Array.isArray(r.body) && r.body.every((u) => !('passwordHash' in u) && !('password' in u)),
    r.body,
  );
  check(
    'GET /api/users → email, displayName, id, createdAt',
    Array.isArray(r.body) &&
      r.body.every((u) =>
        ['id', 'email', 'displayName', 'createdAt'].every((k) => k in u),
      ),
    r.body,
  );

  r = await call('GET', '/api/users/u1');
  check('GET /api/users/u1 → 200', r.status === 200 && r.body.id === 'u1', r.status);

  r = await call('GET', '/api/users/nobody');
  check('GET /api/users/nobody → 404 error body', r.status === 404 && isErrorBody(r, 404), r);

  r = await call('POST', '/api/users', {
    email: 'new.member@puong.dev',
    displayName: 'New Member',
    password: 'Passw0rd!',
  });
  check('POST /api/users → 201', r.status === 201, r);
  const createdUser = r.body && r.body.id;
  check('POST /api/users → returns no hash', r.status === 201 && !('passwordHash' in r.body), r.body);
  check('POST /api/users → email lower-cased', r.body && r.body.email === 'new.member@puong.dev', r.body);

  r = await call('POST', '/api/users', {
    email: 'NEW.MEMBER@puong.dev',
    displayName: 'Impostor',
    password: 'Passw0rd!',
  });
  check('POST /api/users duplicate → 409', r.status === 409 && isErrorBody(r, 409), r);

  r = await call('POST', '/api/users', {
    email: 'not-an-email',
    displayName: 'A',
    password: 'short',
  });
  check('POST /api/users invalid → 400 + messages', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('POST', '/api/users', {
    email: 'x@puong.dev',
    displayName: 'X',
    password: 'long-enough',
    passwordHash: 'sneaky',
  });
  check('POST /api/users unknown property → 400', r.status === 400, r);

  r = await call('PATCH', `/api/users/${createdUser}`, { displayName: 'Renamed Member' });
  check('PATCH /api/users/:id → 200', r.status === 200 && r.body.displayName === 'Renamed Member', r);

  r = await call('PATCH', `/api/users/${createdUser}`, {});
  check('PATCH /api/users/:id {} → 400', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('PATCH', '/api/users/nobody', { displayName: 'Ghost' });
  check('PATCH /api/users/nobody → 404', r.status === 404 && isErrorBody(r, 404), r);

  /* ---------------------------------------------------------------- trees */
  r = await call('GET', '/api/trees');
  check('GET /api/trees → 200 (2 seeded)', r.status === 200 && r.body.length === 2, r.body);

  r = await call('GET', '/api/trees?memberId=u3');
  check(
    'GET /api/trees?memberId=u3 → only ACTIVE trees (u3 is INVITED in t2)',
    r.status === 200 && r.body.length === 1 && r.body[0].id === 't1',
    r.body,
  );

  r = await call('GET', '/api/trees?memberId=u2');
  check(
    'GET /api/trees?memberId=u2 → only t1',
    r.status === 200 && r.body.length === 1 && r.body[0].id === 't1',
    r.body,
  );

  r = await call('POST', '/api/trees', { name: 'Check tree', ownerId: 'u2' });
  check('POST /api/trees → 201', r.status === 201 && r.body.name === 'Check tree', r);
  const checkTree = r.body && r.body.id;

  r = await call('GET', `/api/trees/${checkTree}/members`);
  check(
    'POST /api/trees → also creates an ACTIVE OWNER membership',
    r.status === 200 && r.body.some((m) => m.userId === 'u2' && m.role === 'OWNER' && m.status === 'ACTIVE'),
    r.body,
  );

  r = await call('POST', '/api/trees', { name: 'Orphan', ownerId: 'ghost' });
  check('POST /api/trees unknown owner → 404', r.status === 404 && isErrorBody(r, 404), r);

  r = await call('POST', '/api/trees', { name: 'x', ownerId: 'u1' });
  check('POST /api/trees short name → 400', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('GET', '/api/trees/t1');
  check('GET /api/trees/t1 → 200', r.status === 200 && r.body.id === 't1', r.status);

  r = await call('GET', '/api/trees/nope');
  check('GET /api/trees/nope → 404', r.status === 404 && isErrorBody(r, 404), r);

  r = await call('PATCH', '/api/trees/t1', { description: 'Updated by the check.' });
  check('PATCH /api/trees/t1 → 200', r.status === 200 && r.body.description === 'Updated by the check.', r);
  r = await call('PATCH', '/api/trees/t1', { description: null });
  check('PATCH /api/trees/t1 → can clear a nullable field', r.body.description === null, r.body);

  r = await call('PATCH', '/api/trees/t1', {});
  check('PATCH /api/trees/t1 {} → 400', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('PATCH', '/api/trees/t1', { ownerId: 'u2' });
  check('PATCH /api/trees/t1 ownerId (not a field) → 400', r.status === 400, r);

  r = await call('PATCH', '/api/trees/t1', { successorId: 'ghost' });
  check('PATCH /api/trees/t1 unknown successor → 404', r.status === 404 && isErrorBody(r, 404), r);

  /* ------------------------------------------------------------ members */
  r = await call('GET', '/api/trees/t1/members');
  check('GET /api/trees/t1/members → 3 seeded memberships', r.status === 200 && r.body.length === 3, r.body);

  r = await call('GET', '/api/trees/t1/members/u2');
  check('GET .../members/u2 → 200 CONTRIBUTOR', r.status === 200 && r.body.role === 'CONTRIBUTOR', r);

  r = await call('GET', '/api/trees/t2/members/u3');
  check('GET .../members/u3 in t2 → INVITED membership is visible', r.status === 200 && r.body.status === 'INVITED', r);

  r = await call('GET', '/api/trees/t1/members/u1');
  check('GET .../members/u1 → 200', r.status === 200, r);

  r = await call('GET', '/api/trees/nope/members');
  check('GET /api/trees/nope/members → 404', r.status === 404 && isErrorBody(r, 404), r);

  r = await call('POST', '/api/trees/t1/members', { userId: createdUser, role: 'VIEWER' });
  check('POST /api/trees/t1/members → 201 INVITED by default', r.status === 201 && r.body.status === 'INVITED', r);
  const membershipId = r.body && r.body.id;

  r = await call('POST', '/api/trees/t1/members', { userId: createdUser, role: 'VIEWER' });
  check('POST duplicate member → 409', r.status === 409 && isErrorBody(r, 409), r);

  r = await call('POST', '/api/trees/t1/members', { userId: 'ghost', role: 'VIEWER' });
  check('POST unknown user → 404', r.status === 404 && isErrorBody(r, 404), r);

  r = await call('POST', '/api/trees/t1/members', { userId: createdUser, role: 'ADMIN' });
  check('POST role outside the enum → 400', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('PATCH', `/api/memberships/${membershipId}`, { status: 'ACTIVE', role: 'CONTRIBUTOR' });
  check('PATCH /api/memberships/:id → 200 role+status', r.status === 200 && r.body.role === 'CONTRIBUTOR' && r.body.status === 'ACTIVE', r);

  r = await call('PATCH', '/api/memberships/ghost', { role: 'VIEWER' });
  check('PATCH /api/memberships/ghost → 404', r.status === 404 && isErrorBody(r, 404), r);

  r = await call('PATCH', `/api/memberships/${membershipId}`, {});
  check('PATCH /api/memberships/:id {} → 400', r.status === 400 && isErrorBody(r, 400), r);

  /* -------------------------------------------------------------- people */
  r = await call('GET', '/api/trees/t1/people');
  check('GET /api/trees/t1/people → 23 seeded', r.status === 200 && r.body.length === 23, r.body && r.body.length);

  r = await call('GET', '/api/trees/t2/people');
  check('GET /api/trees/t2/people → empty array (FR-8.4 empty state)', r.status === 200 && r.body.length === 0, r.body);

  r = await call('GET', '/api/trees/t1/people/p09');
  check('GET .../people/p09 → 200', r.status === 200 && r.body.fullName === 'Chheng Sokuntheary', r.body);

  r = await call('GET', '/api/trees/t2/people/p09');
  check('GET .../people/p09 from the wrong tree → 404', r.status === 404 && isErrorBody(r, 404), r);

  r = await call('POST', '/api/trees/t1/people', {
    fullName: '  Check Person  ',
    birthDate: '1999-12-31',
    createdById: 'u2',
  });
  check('POST /api/trees/t1/people → 201', r.status === 201 && r.body.fullName === 'Check Person', r);
  const checkPerson = r.body && r.body.id;
  check('POST person → defaults isLiving true, null dates', r.body && r.body.isLiving === true && r.body.deathDate === null, r.body);

  r = await call('POST', '/api/trees/t1/people', { createdById: 'u1' });
  check('POST person without fullName → 400', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('POST', '/api/trees/t1/people', {
    fullName: 'Time Traveller',
    birthDate: '1990-01-01',
    deathDate: '1980-01-01',
    createdById: 'u1',
  });
  check('POST person death before birth → 400 (story 4)', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('POST', '/api/trees/t1/people', {
    fullName: 'Leap Year Fantasy',
    birthDate: '2026-02-31',
    createdById: 'u1',
  });
  check('POST person 2026-02-31 → 400 (not a real date)', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('POST', '/api/trees/t1/people', { fullName: 'Ghost Writer', createdById: 'ghost' });
  check('POST person unknown creator → 404', r.status === 404 && isErrorBody(r, 404), r);

  r = await call('PATCH', `/api/trees/t1/people/${checkPerson}`, { bio: 'Added by the check.', gender: 'OTHER' });
  check('PATCH person → 200', r.status === 200 && r.body.bio === 'Added by the check.', r);

  r = await call('PATCH', `/api/trees/t1/people/${checkPerson}`, {});
  check('PATCH person {} → 400', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('PATCH', '/api/trees/t1/people/ghost', { fullName: 'Nope' });
  check('PATCH person ghost → 404', r.status === 404 && isErrorBody(r, 404), r);

  /* ------------------------------------------------------------ relations */
  r = await call('GET', '/api/trees/t1/relations');
  check('GET /api/trees/t1/relations → 36 seeded', r.status === 200 && r.body.length === 36, r.body && r.body.length);

  r = await call('POST', '/api/trees/t1/relations', { fromId: 'p01', toId: 'p01', type: 'SPOUSE' });
  check('POST relation self-link → 400', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('POST', '/api/trees/t1/relations', { fromId: 'p01', toId: 'p03', type: 'PARENT' });
  check('POST duplicate relation → 409', r.status === 409 && isErrorBody(r, 409), r);

  r = await call('POST', '/api/trees/t1/relations', { fromId: 'p01', toId: 'p03', type: 'SPOUSE' });
  check('POST same pair, different type → 201', r.status === 201, r);
  const otherTypeRel = r.body && r.body.id;

  r = await call('POST', '/api/trees/t1/relations', { fromId: 'p03', toId: 'p01', type: 'PARENT' });
  check('POST parent link that loops the tree → 400', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('POST', '/api/trees/t1/relations', { fromId: 'p01', toId: 'ghost', type: 'PARENT' });
  check('POST relation to a person outside the tree → 404', r.status === 404 && isErrorBody(r, 404), r);

  r = await call('POST', '/api/trees/t1/relations', { fromId: 'p01', toId: 'p03', type: 'VIBES' });
  check('POST relation type outside the enum → 400', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('DELETE', `/api/trees/t1/relations/${otherTypeRel}`);
  check('DELETE relation → 204, empty body', r.status === 204 && r.raw === '', r);

  r = await call('DELETE', `/api/trees/t1/relations/${otherTypeRel}`);
  check('DELETE relation again → 404', r.status === 404 && isErrorBody(r, 404), r);

  /* ------------------------------------------------------------- memories */
  r = await call('GET', '/api/trees/t1/memories');
  check('GET memories (no viewer) → 6 seeded', r.status === 200 && r.body.length === 6, r.body && r.body.length);
  const order = r.body.map((m) => m.happenedAt);
  const dated = order.filter((d) => d !== null);
  const undatedAt = order.lastIndexOf(null);
  check(
    'FR-6.7 → dated memories newest first, undated last',
    JSON.stringify(dated) === JSON.stringify([...dated].sort().reverse()) &&
      (order.length === dated.length || order.slice(dated.length).every((d) => d === null)),
    order,
  );
  check(
    'FR-6.6 → a private memory is hidden from another viewer',
    (await call('GET', '/api/trees/t1/memories?viewerId=u3')).body.length === 4,
    undefined,
  );
  check(
    'FR-6.6 → its author sees it',
    (await call('GET', '/api/trees/t1/memories?viewerId=u1')).body.length === 5,
    undefined,
  );

  r = await call('GET', '/api/trees/t1/memories?personId=p01');
  check('GET memories?personId=p01 → 2', r.status === 200 && r.body.length === 2, r.body);

  r = await call('GET', '/api/trees/t1/memories/mm3?viewerId=u3');
  check('GET a private memory as someone else → 404', r.status === 404 && isErrorBody(r, 404), r);
  r = await call('GET', '/api/trees/t1/memories/mm3?viewerId=u1');
  check('GET a private memory as its author → 200', r.status === 200, r.status);

  r = await call('POST', '/api/trees/t1/memories', {
    personId: checkPerson,
    authorId: 'u2',
    title: 'A check memory',
    body: 'Written by the M2 verification script.',
    happenedAt: '',
    visibility: 'TREE',
  });
  check('POST memory with a blank date → 201, stored as null', r.status === 201 && r.body.happenedAt === null, r);
  const checkMemory = r.body && r.body.id;

  r = await call('POST', '/api/trees/t1/memories', {
    personId: 'ghost',
    authorId: 'u1',
    title: 'Orphan',
    body: 'Belongs to nobody.',
    visibility: 'TREE',
  });
  check('POST memory for a person outside the tree → 404', r.status === 404 && isErrorBody(r, 404), r);

  r = await call('POST', '/api/trees/t1/memories', {
    personId: 'p01',
    authorId: 'u1',
    title: '',
    body: '',
    visibility: 'TREE',
  });
  check('POST memory without title/body → 400 (FR-6.1)', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('POST', '/api/trees/t1/memories', {
    personId: 'p01',
    authorId: 'u1',
    title: 'Bad date',
    body: 'The 31st of February.',
    happenedAt: '2026-02-31',
    visibility: 'TREE',
  });
  check('POST memory 2026-02-31 → 400', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('PATCH', `/api/trees/t1/memories/${checkMemory}`, { visibility: 'PRIVATE' });
  check('PATCH memory → 200 visibility', r.status === 200 && r.body.visibility === 'PRIVATE', r);

  r = await call('PATCH', `/api/trees/t1/memories/${checkMemory}`, {});
  check('PATCH memory {} → 400', r.status === 400 && isErrorBody(r, 400), r);

  /* -------------------------------------------------------------- search */
  r = await call('GET', '/api/trees/t1/search?q=theary');
  check('GET search q=theary → 200 page shape', r.status === 200 && 'totalPages' in r.body && 'items' in r.body, r.body);
  check('GET search → finds Sokuntheary', r.body.items.some((i) => i.kind === 'person' && i.person.fullName.includes('Sokuntheary')), r.body);
  const lowerTotal = r.body.total;

  r = await call('GET', '/api/trees/t1/search?q=Theary');
  check(
    'GET search is case-insensitive → same total as q=theary',
    r.status === 200 && r.body.total === lowerTotal,
    { upper: r.body.total, lower: lowerTotal },
  );

  r = await call('GET', '/api/trees/t1/search?q=SOKUNTHEARY');
  check(
    'GET search is case-insensitive → same total in upper case',
    r.body.total === lowerTotal,
    { upper: r.body.total, lower: lowerTotal },
  );

  r = await call('GET', '/api/trees/t1/search?q=%C3%A9');
  check('GET search matches an accent typed literally (é)', r.status === 200, r.status);
  const accented = r.body.total;
  r = await call('GET', '/api/trees/t1/search?q=e');
  check(
    'GET search is accent-insensitive → é and e find the same rows',
    accented === r.body.total,
    { accented, plain: r.body.total },
  );

  r = await call('GET', `/api/trees/t1/search?q=school&viewerId=u3`);
  const schoolHidden = r.body.total;
  r = await call('GET', `/api/trees/t1/search?q=school`);
  check(
    'FR-6.6 in search → a private memory is a hit only for someone allowed to read it',
    schoolHidden === 0 && r.body.total === 1,
    { u3: schoolHidden, noViewer: r.body.total },
  );
  r = await call('GET', `/api/trees/t1/search?q=school&viewerId=u2`);
  check(
    'FR-6.6 in search → its author still finds it',
    r.body.total === 1,
    r.body.total,
  );

  r = await call('GET', '/api/trees/t1/search?q=');
  check('GET search with an empty q → empty page, not an error', r.status === 200 && r.body.total === 0, r.body);

  r = await call('GET', '/api/trees/t1/search?q=a&page=0');
  check('GET search page=0 → 400', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('GET', '/api/trees/nope/search?q=a');
  check('GET search in a missing tree → 404', r.status === 404 && isErrorBody(r, 404), r);

  r = await call('GET', '/api/trees/t1/search?q=mango&pageSize=2');
  check('GET search pageSize=2 → at most 2 items', r.status === 200 && r.body.items.length <= 2, r.body.items && r.body.items.length);

  /* -------------------------------------------------- cleanup + cascade */
  r = await call('DELETE', `/api/trees/t1/people/${checkPerson}`);
  check('DELETE person → 204', r.status === 204 && r.raw === '', r);
  r = await call('GET', `/api/trees/t1/people/${checkPerson}`);
  check('DELETE person again → 404', r.status === 404, r.status);

  r = await call('DELETE', `/api/memberships/${membershipId}`);
  check('DELETE membership → 204', r.status === 204, r.status);
  r = await call('DELETE', `/api/memberships/${membershipId}`);
  check('DELETE membership again → 404', r.status === 404, r.status);

  r = await call('DELETE', `/api/users/${createdUser}`);
  check('DELETE /api/users/:id → 404 (no such endpoint by design)', r.status === 404, r.status);

  r = await call('DELETE', `/api/trees/${checkTree}`);
  check('DELETE tree → 204', r.status === 204, r.status);
  r = await call('GET', `/api/trees/${checkTree}`);
  check('DELETE tree again → 404', r.status === 404, r.status);
  r = await call('GET', `/api/trees/${checkTree}/members`);
  check('DELETE tree cascades its memberships → 404', r.status === 404, r.status);

  /* ------------------------------------------------------------- swagger */
  r = await call('GET', '/api/docs/json');
  const doc = r.body;
  const paths = doc && typeof doc === 'object' ? Object.keys(doc.paths || {}) : [];
  check('GET /api/docs/json → 200 OpenAPI document', r.status === 200 && paths.length > 0, r.status);
  const wanted = [
    '/api/users',
    '/api/users/{id}',
    '/api/trees',
    '/api/trees/{id}',
    '/api/trees/{treeId}/members',
    '/api/trees/{treeId}/members/{userId}',
    '/api/memberships/{id}',
    '/api/trees/{treeId}/people',
    '/api/trees/{treeId}/people/{personId}',
    '/api/trees/{treeId}/relations',
    '/api/trees/{treeId}/relations/{relationId}',
    '/api/trees/{treeId}/memories',
    '/api/trees/{treeId}/memories/{memoryId}',
    '/api/trees/{treeId}/search',
  ];
  for (const p of wanted) {
    check(`Swagger documents ${p}`, paths.includes(p), paths);
  }
  const docText = JSON.stringify(doc);
  check('Swagger documents the error schema', docText.includes('statusCode') && docText.includes('message'), undefined);

  /* ------------------------------------------------------------- report */
  console.log(`\napi-check: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('api-check crashed:', error);
  process.exitCode = 1;
});
