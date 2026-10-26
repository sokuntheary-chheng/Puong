/**
 * M2 + M3 verification: every endpoint, every status code, one error shape,
 * and every rule of the permission matrix in docs/design.md §2.1.
 *
 * Run it against a *seeded* database with the API already listening:
 *
 *   npm run seed          # restore the demo family — run this first for a
 *   npm run start:dev     # known baseline; the script cleans up after
 *   npm run check         # itself, so a second run in a row also passes
 *
 * It also passes against a *stale* database, because everything it creates
 * it deletes again (or names with a timestamp), which is what makes it
 * usable as a regression check rather than a one-shot demo.
 *
 * **Sessions.** The script signs in as all three seeded accounts at the
 * start and carries their cookies, because M3's whole subject is that the
 * answer depends on who is asking. Every call takes `{ as: 'owner' |
 * 'contributor' | 'viewer' | 'none' }` and defaults to `owner` — the
 * privileged session, so a check that forgets to narrow itself fails loudly
 * instead of quietly passing as a viewer.
 *
 * It is a script rather than a jest suite because it needs the real server,
 * the real database and the real status codes; the unit/e2e suites in
 * `npm test` cover the parts that do not. `process.exitCode` is set to 1 on
 * any failure, so it is usable in CI.
 */
const BASE = process.env.API_BASE || 'http://localhost:3000';

/** Cookie jars by session name; `null` means "signed out" on purpose. */
const sessions = { none: null };

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

/** `Set-Cookie` as one `Cookie` header value: `a=1; b=2`. */
function cookieHeaderOf(res) {
  const list =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : res.headers.get('set-cookie') === null
        ? []
        : [res.headers.get('set-cookie')];
  return list.map((entry) => entry.split(';')[0]).join('; ');
}

async function signIn() {
  const accounts = [
    ['owner', 'owner@puong.dev'],
    ['contributor', 'contributor@puong.dev'],
    ['viewer', 'viewer@puong.dev'],
  ];

  for (const [name, email] of accounts) {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'Passw0rd!' }),
    });
    if (res.status !== 200) {
      throw new Error(
        `cannot sign in as ${email} → ${res.status} ${await res.text()}\n` +
          'Is the API running, and has `npm run seed` been run?',
      );
    }
    sessions[name] = cookieHeaderOf(res);
  }
}

/**
 * One request. `as` picks a session ('none' for no cookie), `cookie` sends
 * a raw jar (used for the account a test registers), and `origin` sets the
 * `Origin` header so the cross-site check can be exercised.
 */
async function call(method, path, body, { as = 'owner', cookie, origin } = {}) {
  const jar = cookie !== undefined ? cookie : sessions[as];
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (jar) headers.cookie = jar;
  if (origin !== undefined) headers.origin = origin;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text === '' ? null : JSON.parse(text);
  } catch {
    json = { __unparsed: text };
  }
  return {
    status: res.status,
    body: json,
    raw: text,
    setCookie:
      typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [],
    /** Every response header, by lowercase name — helmet and the throttler
     *  are asserted from here rather than from a second curl script. */
    headers: Object.fromEntries(res.headers),
  };
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
  await signIn();

  /* ----------------------------------------------------------------- auth */
  const stamp = Date.now();
  const freshEmail = `check-${stamp}@puong.dev`;

  let r = await call(
    'POST',
    '/api/auth/register',
    { email: freshEmail, displayName: 'Check Account', password: 'Passw0rd!' },
    { as: 'none' },
  );
  check('POST /api/auth/register → 201', r.status === 201 && r.body.user?.email === freshEmail, r);
  const registeredCookie = cookieHeaderFrom(r);
  check(
    'register → sets an httpOnly, SameSite=Strict session cookie',
    registeredCookie.includes('puong_session=') &&
      /HttpOnly/i.test(r.setCookie.join(' ')) &&
      /SameSite=Strict/i.test(r.setCookie.join(' ')),
    r.setCookie,
  );
  check(
    'register → no token in the body (httpOnly would be decoration otherwise)',
    !JSON.stringify(r.body).includes('eyJ'),
    r.body,
  );
  check('register → no passwordHash in the body', !('passwordHash' in (r.body.user ?? {})), r.body);

  r = await call('POST', '/api/auth/login', { email: freshEmail, password: 'Passw0rd!' }, { as: 'none' });
  check('POST /api/auth/login → 200', r.status === 200 && r.body.user?.email === freshEmail, r);
  check('login → no token in the body', !JSON.stringify(r.body).includes('eyJ'), r.body);

  r = await call('GET', '/api/auth/me', undefined, { cookie: registeredCookie });
  check('GET /api/auth/me with the cookie → 200', r.status === 200 && r.body.email === freshEmail, r);

  r = await call('GET', '/api/auth/me', undefined, { as: 'none' });
  check('GET /api/auth/me without a cookie → 401', r.status === 401 && isErrorBody(r, 401), r);

  const wrongPassword = await call(
    'POST',
    '/api/auth/login',
    { email: freshEmail, password: 'definitely-wrong-1' },
    { as: 'none' },
  );
  const unknownUser = await call(
    'POST',
    '/api/auth/login',
    { email: `nobody-${stamp}@puong.dev`, password: 'Passw0rd!' },
    { as: 'none' },
  );
  check(
    'login → wrong password and unknown address are the same message',
    wrongPassword.status === 401 &&
      unknownUser.status === 401 &&
      JSON.stringify(wrongPassword.body.message) === JSON.stringify(unknownUser.body.message) &&
      isErrorBody(wrongPassword, 401),
    { wrongPassword, unknownUser },
  );

  r = await call('POST', '/api/auth/logout', undefined, { cookie: registeredCookie });
  check(
    'POST /api/auth/logout → 204 and the cookie is expired',
    r.status === 204 && r.setCookie.join(' ').toLowerCase().includes('expires=thu, 01 jan 1970'),
    r,
  );

  /* Signing out has to reach the server. The cookie is gone from the
     browser, but this copy of it still verifies — only the revocation stamp
     `logout` wrote can refuse it. */
  r = await call('GET', '/api/auth/me', undefined, { cookie: registeredCookie });
  check(
    'the token logout revoked is refused, even though its signature still verifies',
    r.status === 401 && isErrorBody(r, 401),
    r,
  );
  check(
    'a revoked token also gets its cookie cleared',
    r.setCookie.join(' ').includes('puong_session=;'),
    r.setCookie,
  );

  r = await call('POST', '/api/auth/login', { email: freshEmail, password: 'Passw0rd!' }, { as: 'none' });
  check(
    'login after logout → a new session that works',
    r.status === 200 &&
      r.setCookie.join(' ').includes('puong_session=') &&
      !JSON.stringify(r.body).includes('eyJ'),
    r,
  );

  /* Security headers (helmet, api/src/main.ts) and the rate-limit headers
     (@nestjs/throttler). Both are on *every* response, a 401 included —
     which is also the proof that the throttler's guard runs before the
     session guard rather than after it. */
  r = await call('GET', '/api/auth/me', undefined, { as: 'none' });
  const csp = r.headers['content-security-policy'] ?? '';
  check(
    'helmet → Content-Security-Policy: own origin, no plugins, no framing',
    csp.includes("default-src 'self'") &&
      csp.includes("script-src 'self'") &&
      csp.includes("connect-src 'self'") &&
      csp.includes("object-src 'none'"),
    csp,
  );
  check('helmet → X-Content-Type-Options: nosniff', r.headers['x-content-type-options'] === 'nosniff', r.headers['x-content-type-options']);
  check('helmet → X-Frame-Options (clickjacking)', typeof r.headers['x-frame-options'] === 'string', r.headers['x-frame-options']);
  check('helmet → Referrer-Policy', typeof r.headers['referrer-policy'] === 'string', r.headers['referrer-policy']);
  check(
    'throttler → X-RateLimit-Limit/Remaining on responses',
    r.headers['x-ratelimit-limit'] === '600' && r.headers['x-ratelimit-remaining'] !== undefined,
    { limit: r.headers['x-ratelimit-limit'], remaining: r.headers['x-ratelimit-remaining'] },
  );

  /* No session at all: the whole API is closed. */
  for (const [method, path, body] of [
    ['GET', '/api/users'],
    ['GET', '/api/trees'],
    ['POST', '/api/trees', { name: 'Unsigned' }],
    ['GET', '/api/trees/t1/people'],
    ['GET', '/api/trees/t1/memories'],
    ['GET', '/api/trees/t1/search?q=a'],
  ]) {
    r = await call(method, path, body, { as: 'none' });
    check(`${method} ${path} without a session → 401`, r.status === 401 && isErrorBody(r, 401), r.status);
  }

  /* SameSite=Strict is the browser's half; this is the server's. */
  r = await call('POST', '/api/trees', { name: 'Taken over' }, { origin: 'https://attacker.example' });
  check('state-changing request from another origin → 403', r.status === 403 && isErrorBody(r, 403), r);

  /* ---------------------------------------------------------------- users */
  r = await call('GET', '/api/users');
  check('GET /api/users → 200', r.status === 200, r.status);
  const seededEmails = ['owner@puong.dev', 'contributor@puong.dev', 'viewer@puong.dev'];
  check(
    'GET /api/users → the three seeded accounts are there',
    Array.isArray(r.body) && seededEmails.every((e) => r.body.some((u) => u.email === e)),
    r.body,
  );
  check(
    'GET /api/users → no passwordHash anywhere',
    Array.isArray(r.body) && r.body.every((u) => !('passwordHash' in u) && !('password' in u)),
    r.body,
  );
  check(
    'GET /api/users → email, displayName, id, createdAt',
    Array.isArray(r.body) &&
      r.body.every((u) => ['id', 'email', 'displayName', 'createdAt'].every((k) => k in u)),
    r.body,
  );

  r = await call('GET', '/api/users/u1');
  check('GET /api/users/u1 → 200', r.status === 200 && r.body.id === 'u1', r.status);

  r = await call('GET', '/api/users/nobody');
  check('GET /api/users/nobody → 404 error body', r.status === 404 && isErrorBody(r, 404), r);

  const createdEmail = `check-member-${stamp}@puong.dev`;
  r = await call('POST', '/api/users', {
    email: createdEmail,
    displayName: 'New Member',
    password: 'Passw0rd!',
  });
  check('POST /api/users → 201', r.status === 201, r);
  const createdUser = r.body && r.body.id;
  check('POST /api/users → returns no hash', r.status === 201 && !('passwordHash' in r.body), r.body);
  check('POST /api/users → email lower-cased', r.body && r.body.email === createdEmail, r.body);

  r = await call('POST', '/api/users', {
    email: createdEmail.toUpperCase(),
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
    email: `x-${stamp}@puong.dev`,
    displayName: 'X',
    password: 'long-enough',
    passwordHash: 'sneaky',
  });
  check('POST /api/users unknown property → 400', r.status === 400, r);

  const ownerName = (await call('GET', '/api/users/u1')).body.displayName;
  r = await call('PATCH', '/api/users/u1', { displayName: 'Renamed Owner' });
  check('PATCH my own account → 200', r.status === 200 && r.body.displayName === 'Renamed Owner', r);
  await call('PATCH', '/api/users/u1', { displayName: ownerName });

  r = await call('PATCH', '/api/users/u1', {});
  check('PATCH my own account {} → 400', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('PATCH', `/api/users/${createdUser}`, { displayName: 'Hijacked' });
  check("PATCH somebody else's account → 403", r.status === 403 && isErrorBody(r, 403), r);

  r = await call('PATCH', '/api/users/nobody', { displayName: 'Ghost' });
  check('PATCH an unknown account → 403 (the self-check comes first)', r.status === 403, r);

  /* ---------------------------------------------------------------- trees */
  r = await call('GET', '/api/trees');
  check('GET /api/trees (owner) → 2 seeded trees', r.status === 200 && r.body.length === 2, r.body);

  r = await call('GET', '/api/trees', undefined, { as: 'viewer' });
  check(
    'GET /api/trees (viewer) → only the tree they belong to',
    r.status === 200 && r.body.length === 1 && r.body[0].id === 't1',
    r.body,
  );

  r = await call('GET', '/api/trees', undefined, { as: 'contributor' });
  check(
    'GET /api/trees (contributor) → only t1 (u3 is INVITED in t2, so t2 is nobody’s list but the owner’s)',
    r.status === 200 && r.body.length === 1 && r.body[0].id === 't1',
    r.body,
  );

  r = await call('POST', '/api/trees', { name: 'Check tree' });
  check('POST /api/trees → 201 (ownerId comes from the session)', r.status === 201 && r.body.name === 'Check tree', r);
  const checkTree = r.body && r.body.id;

  r = await call('GET', `/api/trees/${checkTree}/members`);
  check(
    'POST /api/trees → also creates an ACTIVE OWNER membership for the caller',
    r.status === 200 && r.body.some((m) => m.userId === 'u1' && m.role === 'OWNER' && m.status === 'ACTIVE'),
    r.body,
  );

  r = await call('POST', '/api/trees', { name: 'Claimed', ownerId: 'u2' });
  check('POST /api/trees with an ownerId → 400 (not a field any more)', r.status === 400, r);

  r = await call('POST', '/api/trees', { name: 'x' });
  check('POST /api/trees short name → 400', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('POST', '/api/trees', { name: 'Viewer’s own tree' }, { as: 'viewer' });
  check('POST /api/trees (viewer) → 201 (FR-2.1: any account may create one)', r.status === 201, r);
  const viewerTree = r.body && r.body.id;
  r = await call('DELETE', `/api/trees/${viewerTree}`, undefined, { as: 'viewer' });
  check('the creator deletes their own tree → 204', r.status === 204, r);

  r = await call('GET', '/api/trees/t1');
  check('GET /api/trees/t1 (owner) → 200', r.status === 200 && r.body.id === 't1', r.status);

  r = await call('GET', '/api/trees/nope');
  check('GET /api/trees/nope → 404', r.status === 404 && isErrorBody(r, 404), r);

  r = await call('GET', '/api/trees/t2', undefined, { as: 'viewer' });
  check(
    'FR-2.3 → a tree you were invited to but have not accepted is 404',
    r.status === 404 && isErrorBody(r, 404),
    r,
  );

  r = await call('GET', '/api/trees/t2', undefined, { as: 'contributor' });
  check(
    'FR-2.5 → a tree you are not a member of is 404, not 403',
    r.status === 404 && isErrorBody(r, 404),
    r,
  );

  r = await call('PATCH', '/api/trees/t1', { description: 'Updated by the check.' });
  check('PATCH /api/trees/t1 (owner) → 200', r.status === 200 && r.body.description === 'Updated by the check.', r);
  r = await call('PATCH', '/api/trees/t1', { description: null });
  check('PATCH /api/trees/t1 → can clear a nullable field', r.body.description === null, r.body);

  r = await call('PATCH', '/api/trees/t1', {});
  check('PATCH /api/trees/t1 {} → 400', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('PATCH', '/api/trees/t1', { ownerId: 'u2' });
  check('PATCH /api/trees/t1 ownerId (not a field) → 400', r.status === 400, r);

  r = await call('PATCH', '/api/trees/t1', { successorId: 'ghost' });
  check('PATCH /api/trees/t1 unknown successor → 404', r.status === 404 && isErrorBody(r, 404), r);

  r = await call('PATCH', '/api/trees/t1', { name: 'Renamed by a contributor' }, { as: 'contributor' });
  check('PATCH a tree as CONTRIBUTOR → 403', r.status === 403 && isErrorBody(r, 403), r);

  r = await call('PATCH', '/api/trees/t1', { name: 'Renamed by a viewer' }, { as: 'viewer' });
  check('PATCH a tree as VIEWER → 403', r.status === 403 && isErrorBody(r, 403), r);

  r = await call('DELETE', '/api/trees/t1', undefined, { as: 'contributor' });
  check('DELETE a tree as CONTRIBUTOR → 403', r.status === 403 && isErrorBody(r, 403), r);

  /* ------------------------------------------------------------ members */
  r = await call('GET', '/api/trees/t1/members');
  check('GET /api/trees/t1/members → 3 seeded memberships', r.status === 200 && r.body.length === 3, r.body);

  r = await call('GET', '/api/trees/t1/members', undefined, { as: 'viewer' });
  check('GET the member list as VIEWER → 200 (you may see your own tree)', r.status === 200, r.status);

  r = await call('GET', '/api/trees/t2/members', undefined, { as: 'viewer' });
  check('GET a member list you are not in → 404', r.status === 404 && isErrorBody(r, 404), r);

  r = await call('GET', '/api/trees/t1/members/u2');
  check('GET .../members/u2 → 200 CONTRIBUTOR', r.status === 200 && r.body.role === 'CONTRIBUTOR', r);

  r = await call('GET', '/api/trees/t2/members/u3');
  check('GET .../members/u3 in t2 → INVITED membership is visible', r.status === 200 && r.body.status === 'INVITED', r);

  r = await call('GET', '/api/trees/t1/members/u1');
  check('GET .../members/u1 → 200', r.status === 200, r);

  r = await call('GET', '/api/trees/nope/members');
  check('GET /api/trees/nope/members → 404', r.status === 404 && isErrorBody(r, 404), r);

  r = await call('POST', '/api/trees/t1/members', { userId: createdUser, role: 'VIEWER' }, { as: 'viewer' });
  check('POST a member as VIEWER → 403', r.status === 403 && isErrorBody(r, 403), r);

  r = await call('POST', '/api/trees/t1/members', { userId: createdUser, role: 'VIEWER' }, { as: 'contributor' });
  check('POST a member as CONTRIBUTOR → 403', r.status === 403 && isErrorBody(r, 403), r);

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
  check('PATCH /api/memberships/:id (owner) → 200 role+status', r.status === 200 && r.body.role === 'CONTRIBUTOR' && r.body.status === 'ACTIVE', r);

  r = await call('PATCH', `/api/memberships/${membershipId}`, { role: 'OWNER' }, { as: 'contributor' });
  check("PATCH somebody else's membership as CONTRIBUTOR → 403", r.status === 403 && isErrorBody(r, 403), r);

  r = await call('PATCH', `/api/memberships/${membershipId}`, { role: 'OWNER' }, { as: 'viewer' });
  check('PATCH a membership as VIEWER → 403', r.status === 403 && isErrorBody(r, 403), r);

  r = await call('PATCH', '/api/memberships/ghost', { role: 'VIEWER' });
  check('PATCH /api/memberships/ghost → 404', r.status === 404 && isErrorBody(r, 404), r);

  r = await call('PATCH', `/api/memberships/${membershipId}`, {});
  check('PATCH /api/memberships/:id {} → 400', r.status === 400 && isErrorBody(r, 400), r);

  /* FR-3.5 — accepting your own invitation is the one membership change a
     non-owner makes; promoting yourself while you are there is not. */
  r = await call('PATCH', '/api/memberships/mb5', { status: 'ACTIVE' }, { as: 'viewer' });
  check('accept my own invitation → 200', r.status === 200 && r.body.status === 'ACTIVE', r);

  r = await call('PATCH', '/api/memberships/mb5', { role: 'OWNER' }, { as: 'viewer' });
  check('promote myself in my own row → 403', r.status === 403 && isErrorBody(r, 403), r);

  r = await call('PATCH', '/api/memberships/mb5', { status: 'INVITED' });
  check('owner puts the invitation back', r.status === 200 && r.body.status === 'INVITED', r);

  /* A tree with no owner could not be administered again through this API.
     The rule bites on *status*, not on role: an owner may edit their own
     row (that is what accepting an invitation is), but the last owner cannot
     take themself out of ACTIVE and leave nobody to administer the tree. */
  r = await call('PATCH', '/api/memberships/mb1', { status: 'INVITED' });
  check('the last owner deactivates their own membership → 409', r.status === 409 && isErrorBody(r, 409), r);

  r = await call('DELETE', '/api/memberships/mb1');
  check('the last owner leaves the tree → 409', r.status === 409 && isErrorBody(r, 409), r);

  /* Role changes on somebody else's row are the owner's to make, and the
     only owner of t1 is the one holding that row — so self-demotion is
     refused for a different, earlier reason: your own row is status only. */
  r = await call('PATCH', '/api/memberships/mb1', { role: 'CONTRIBUTOR' });
  check('the last owner demotes their own row → 403 (own row is status only)', r.status === 403 && isErrorBody(r, 403), r);

  /* -------------------------------------------------------------- people */
  r = await call('GET', '/api/trees/t1/people');
  check('GET /api/trees/t1/people → 23 seeded', r.status === 200 && r.body.length === 23, r.body && r.body.length);

  r = await call('GET', '/api/trees/t2/people');
  check('GET /api/trees/t2/people → empty array (FR-8.4 empty state)', r.status === 200 && r.body.length === 0, r.body);

  r = await call('GET', '/api/trees/t2/people', undefined, { as: 'viewer' });
  check('GET people in a tree you are not in → 404', r.status === 404 && isErrorBody(r, 404), r);

  r = await call('GET', '/api/trees/t1/people/p09');
  check('GET .../people/p09 → 200', r.status === 200 && r.body.fullName === 'Chheng Sokuntheary', r.body);

  r = await call('GET', '/api/trees/t2/people/p09');
  check('GET .../people/p09 from the wrong tree → 404', r.status === 404 && isErrorBody(r, 404), r);

  r = await call('POST', '/api/trees/t1/people', { fullName: 'Nope' }, { as: 'viewer' });
  check('POST a person as VIEWER → 403', r.status === 403 && isErrorBody(r, 403), r);

  r = await call('POST', '/api/trees/t1/people', {
    fullName: '  Check Person  ',
    birthDate: '1999-12-31',
  });
  check('POST /api/trees/t1/people → 201', r.status === 201 && r.body.fullName === 'Check Person', r);
  const checkPerson = r.body && r.body.id;
  check('POST person → defaults isLiving true, null dates', r.body && r.body.isLiving === true && r.body.deathDate === null, r.body);
  check('POST person → createdById is the caller, not a field', r.body && r.body.createdById === 'u1', r.body);

  r = await call('POST', '/api/trees/t1/people', {
    fullName: 'Spoofed Provenance',
    createdById: 'u1',
  });
  check('POST person with a createdById → 400 (not a field any more)', r.status === 400, r);

  r = await call('POST', '/api/trees/t1/people', {});
  check('POST person without fullName → 400', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('POST', '/api/trees/t1/people', {
    fullName: 'Time Traveller',
    birthDate: '1990-01-01',
    deathDate: '1980-01-01',
  });
  check('POST person death before birth → 400 (story 4)', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('POST', '/api/trees/t1/people', {
    fullName: 'Leap Year Fantasy',
    birthDate: '2026-02-31',
  });
  check('POST person 2026-02-31 → 400 (not a real date)', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('PATCH', `/api/trees/t1/people/${checkPerson}`, { bio: 'Added by the check.', gender: 'OTHER' });
  check('PATCH a person I created → 200 (FR-4.4)', r.status === 200 && r.body.bio === 'Added by the check.', r);

  r = await call('PATCH', `/api/trees/t1/people/${checkPerson}`, {});
  check('PATCH person {} → 400', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('PATCH', '/api/trees/t1/people/ghost', { fullName: 'Nope' });
  check('PATCH person ghost → 404', r.status === 404 && isErrorBody(r, 404), r);

  r = await call('PATCH', `/api/trees/t1/people/${checkPerson}`, { bio: 'Nope' }, { as: 'viewer' });
  check('PATCH a person as VIEWER → 403', r.status === 403 && isErrorBody(r, 403), r);

  /* A record the contributor did *not* create: FR-4.4 says owner only. */
  r = await call('POST', '/api/trees/t1/people', { fullName: 'Owner Record' });
  check('POST a person as OWNER → 201', r.status === 201 && r.body.createdById === 'u1', r);
  const ownerPerson = r.body && r.body.id;

  r = await call('PATCH', `/api/trees/t1/people/${ownerPerson}`, { bio: 'Borrowed' }, { as: 'contributor' });
  check("PATCH a person another member created, as CONTRIBUTOR → 403", r.status === 403 && isErrorBody(r, 403), r);

  r = await call('PATCH', `/api/trees/t1/people/${ownerPerson}`, { bio: 'Curated' });
  check('PATCH a person another member created, as OWNER → 200 (FR-4.4)', r.status === 200 && r.body.bio === 'Curated', r);

  r = await call('DELETE', `/api/trees/t1/people/${ownerPerson}`, undefined, { as: 'contributor' });
  check("DELETE a person another member created, as CONTRIBUTOR → 403", r.status === 403 && isErrorBody(r, 403), r);

  /* ------------------------------------------------------------ relations */
  r = await call('GET', '/api/trees/t1/relations');
  check('GET /api/trees/t1/relations → 36 seeded', r.status === 200 && r.body.length === 36, r.body && r.body.length);

  r = await call('POST', '/api/trees/t1/relations', { fromId: 'p01', toId: 'p02', type: 'SPOUSE' }, { as: 'viewer' });
  check('POST a relation as VIEWER → 403', r.status === 403 && isErrorBody(r, 403), r);

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

  r = await call('DELETE', `/api/trees/t1/relations/${otherTypeRel}`, undefined, { as: 'viewer' });
  check('DELETE a relation as VIEWER → 403', r.status === 403 && isErrorBody(r, 403), r);

  r = await call('DELETE', `/api/trees/t1/relations/${otherTypeRel}`);
  check('DELETE relation → 204, empty body', r.status === 204 && r.raw === '', r);

  r = await call('DELETE', `/api/trees/t1/relations/${otherTypeRel}`);
  check('DELETE relation again → 404', r.status === 404 && isErrorBody(r, 404), r);

  /* ------------------------------------------------------------- memories */
  const memoryCountFor = async (as) => (await call('GET', '/api/trees/t1/memories', undefined, { as })).body.length;
  const ownerMemories = await memoryCountFor('owner');
  const contributorMemories = await memoryCountFor('contributor');
  const viewerMemories = await memoryCountFor('viewer');

  r = await call('GET', '/api/trees/t1/memories');
  check('FR-6.6 → the author of a private memory sees it (owner: 5 of 6)', r.status === 200 && ownerMemories === 5, ownerMemories);
  check('FR-6.6 → another author sees their own (contributor: 5 of 6)', contributorMemories === 5, contributorMemories);
  check('FR-6.6 → a viewer sees only the shared ones (viewer: 4 of 6)', viewerMemories === 4, viewerMemories);

  const order = r.body.map((m) => m.happenedAt);
  const dated = order.filter((d) => d !== null);
  check(
    'FR-6.7 → dated memories newest first, undated last',
    JSON.stringify(dated) === JSON.stringify([...dated].sort().reverse()) &&
      (order.length === dated.length || order.slice(dated.length).every((d) => d === null)),
    order,
  );

  r = await call('GET', '/api/trees/t1/memories?personId=p01');
  check('GET memories?personId=p01 → 2', r.status === 200 && r.body.length === 2, r.body);

  r = await call('GET', '/api/trees/t1/memories/mm3');
  check('GET a private memory as its author → 200', r.status === 200 && r.body.visibility === 'PRIVATE', r.status);
  r = await call('GET', '/api/trees/t1/memories/mm3', undefined, { as: 'contributor' });
  check('GET a private memory as someone else → 404 (not 403: the id must not be confirmed)', r.status === 404 && isErrorBody(r, 404), r);
  r = await call('GET', '/api/trees/t1/memories/mm3', undefined, { as: 'viewer' });
  check('GET a private memory as a viewer → 404', r.status === 404, r.status);

  r = await call('GET', '/api/trees/t1/memories?viewerId=u1');
  check(
    'GET memories?viewerId= → ignored (the parameter no longer exists, so it cannot widen FR-6.6)',
    r.status === 200 && r.body.length === ownerMemories,
    { status: r.status, length: r.body && r.body.length, ownerMemories },
  );

  r = await call('POST', '/api/trees/t1/memories', {
    personId: checkPerson,
    title: 'A check memory',
    body: 'Written by the M3 verification script.',
    happenedAt: '',
    visibility: 'TREE',
  }, { as: 'contributor' });
  check('POST memory with a blank date → 201, stored as null', r.status === 201 && r.body.happenedAt === null, r);
  const checkMemory = r.body && r.body.id;
  check('POST memory → authorId is the session, not the body', r.body && r.body.authorId === 'u2', r.body);

  r = await call('POST', '/api/trees/t1/memories', {
    personId: checkPerson,
    authorId: 'u1',
    title: 'Spoofed author',
    body: 'Written under somebody else’s name.',
    visibility: 'TREE',
  });
  check('POST memory with an authorId → 400 (not a field any more)', r.status === 400, r);

  r = await call('POST', '/api/trees/t1/memories', {
    personId: checkPerson,
    title: 'Viewer memory',
    body: 'A viewer may not write.',
    visibility: 'TREE',
  }, { as: 'viewer' });
  check('POST memory as VIEWER → 403', r.status === 403 && isErrorBody(r, 403), r);

  r = await call('POST', '/api/trees/t1/memories', {
    personId: 'ghost',
    title: 'Orphan',
    body: 'Belongs to nobody.',
    visibility: 'TREE',
  });
  check('POST memory for a person outside the tree → 404', r.status === 404 && isErrorBody(r, 404), r);

  r = await call('POST', '/api/trees/t1/memories', {
    personId: checkPerson,
    title: '',
    body: '',
    visibility: 'TREE',
  });
  check('POST memory without title/body → 400 (FR-6.1)', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('POST', '/api/trees/t1/memories', {
    personId: checkPerson,
    title: 'Bad date',
    body: 'The 31st of February.',
    happenedAt: '2026-02-31',
    visibility: 'TREE',
  });
  check('POST memory 2026-02-31 → 400', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('PATCH', `/api/trees/t1/memories/${checkMemory}`, { visibility: 'PRIVATE' }, { as: 'contributor' });
  check('PATCH my own memory → 200 visibility', r.status === 200 && r.body.visibility === 'PRIVATE', r);

  r = await call('PATCH', `/api/trees/t1/memories/${checkMemory}`, {}, { as: 'contributor' });
  check('PATCH memory {} → 400', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('PATCH', `/api/trees/t1/memories/${checkMemory}`, { title: 'Nope' }, { as: 'viewer' });
  check('PATCH a memory as VIEWER → 403', r.status === 403, r.status);

  r = await call('PATCH', `/api/trees/t1/memories/${checkMemory}`, { title: 'Rewritten' }, { as: 'owner' });
  check(
    "PATCH somebody else's PRIVATE memory → 404 (FR-6.6: you cannot see it, so you cannot edit it)",
    r.status === 404 && isErrorBody(r, 404),
    r,
  );

  /* The 403 half of docs/design.md §2.2 needs a memory the caller *can*
     see: a shared one somebody else wrote. The owner curates records, never
     another person's account of the past. */
  r = await call('POST', '/api/trees/t1/memories', {
    personId: checkPerson,
    title: 'Contributor shared memory',
    body: 'Written by the contributor, visible to the tree.',
    visibility: 'TREE',
  }, { as: 'contributor' });
  const contributorShared = r.body && r.body.id;
  check('POST a shared memory as contributor → 201', r.status === 201 && r.body.authorId === 'u2', r);

  r = await call('PATCH', `/api/trees/t1/memories/${contributorShared}`, { title: 'Rewritten' });
  check("PATCH somebody else's shared memory → 403, even for the owner (docs/design.md §2.2)", r.status === 403 && isErrorBody(r, 403), r);

  /* Two more rows, so the deletion rules can be tested without spending
     the seed's own memories: one shared by the owner, one private by the
     contributor. */
  r = await call('POST', '/api/trees/t1/memories', {
    personId: checkPerson,
    title: 'Owner shared memory',
    body: 'Written by the owner, visible to the tree.',
    visibility: 'TREE',
  });
  const ownerMemory = r.body && r.body.id;
  check('POST a shared memory as owner → 201', r.status === 201 && r.body.authorId === 'u1', r);

  r = await call('POST', '/api/trees/t1/memories', {
    personId: checkPerson,
    title: 'Contributor private memory',
    body: 'Only the contributor should read this.',
    visibility: 'PRIVATE',
  }, { as: 'contributor' });
  const contributorPrivate = r.body && r.body.id;
  check('POST a private memory as contributor → 201', r.status === 201 && r.body.visibility === 'PRIVATE', r);

  r = await call('DELETE', `/api/trees/t1/memories/${ownerMemory}`, undefined, { as: 'contributor' });
  check("DELETE the owner's shared memory as CONTRIBUTOR → 403 (FR-6.8)", r.status === 403 && isErrorBody(r, 403), r);

  r = await call('DELETE', `/api/trees/t1/memories/${ownerMemory}`, undefined, { as: 'viewer' });
  check('DELETE any memory as VIEWER → 403', r.status === 403, r.status);

  r = await call('DELETE', `/api/trees/t1/memories/${checkMemory}`, undefined, { as: 'owner' });
  check("DELETE the contributor's private memory as OWNER → 404 (FR-6.6: you cannot delete what you cannot see)", r.status === 404 && isErrorBody(r, 404), r);

  r = await call('DELETE', `/api/trees/t1/memories/${ownerMemory}`);
  check("DELETE somebody else's shared memory as OWNER → 204 (FR-6.8)", r.status === 204, r);

  r = await call('DELETE', `/api/trees/t1/memories/${contributorShared}`, undefined, { as: 'contributor' });
  check('DELETE my own shared memory → 204', r.status === 204, r);

  r = await call('DELETE', `/api/trees/t1/memories/${contributorPrivate}`, undefined, { as: 'contributor' });
  check('DELETE my own private memory → 204', r.status === 204, r);

  /* The last row the script wrote, so a second run against the same
     database starts from the same counts the first one did. */
  r = await call('DELETE', `/api/trees/t1/memories/${checkMemory}`, undefined, { as: 'contributor' });
  check('DELETE my own private memory (cleanup) → 204', r.status === 204, r);

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

  /* "school" only appears in mm4 — a PRIVATE memory written by u2. */
  r = await call('GET', '/api/trees/t1/search?q=school', undefined, { as: 'contributor' });
  const authorHits = r.body.total;
  r = await call('GET', '/api/trees/t1/search?q=school', undefined, { as: 'viewer' });
  const viewerHits = r.body.total;
  r = await call('GET', '/api/trees/t1/search?q=school', undefined, { as: 'owner' });
  const ownerHits = r.body.total;
  check(
    'FR-6.6 in search → a private memory is a hit only for its author',
    authorHits === 1 && viewerHits === 0 && ownerHits === 0,
    { author: authorHits, viewer: viewerHits, owner: ownerHits },
  );

  r = await call('GET', '/api/trees/t1/search?q=school&viewerId=u2');
  check('search?viewerId= → 400 (the parameter no longer exists)', r.status === 400, r);

  r = await call('GET', '/api/trees/t1/search?q=');
  check('GET search with an empty q → empty page, not an error', r.status === 200 && r.body.total === 0, r.body);

  r = await call('GET', '/api/trees/t1/search?q=a&page=0');
  check('GET search page=0 → 400', r.status === 400 && isErrorBody(r, 400), r);

  r = await call('GET', '/api/trees/nope/search?q=a');
  check('GET search in a missing tree → 404', r.status === 404 && isErrorBody(r, 404), r);

  r = await call('GET', '/api/trees/t2/search?q=a', undefined, { as: 'viewer' });
  check('GET search in a tree you are not in → 404', r.status === 404, r.status);

  r = await call('GET', '/api/trees/t1/search?q=mango&pageSize=2');
  check('GET search pageSize=2 → at most 2 items', r.status === 200 && r.body.items.length <= 2, r.body.items && r.body.items.length);

  /* -------------------------------------------------- cleanup + cascade */
  r = await call('DELETE', `/api/trees/t1/people/${ownerPerson}`);
  check('DELETE a person another member created, as OWNER → 204 (FR-4.4)', r.status === 204, r);

  r = await call('DELETE', `/api/trees/t1/people/${checkPerson}`);
  check('DELETE a person I created → 204', r.status === 204 && r.raw === '', r);
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
    '/api/auth/register',
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/me',
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
  check('Swagger declares the session cookie', docText.includes('puong_session'), undefined);

  /* ------------------------------------------------------------- report */
  console.log(`\napi-check: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  }
}

/** The `Set-Cookie` rows for one response, as a `Cookie` header value. */
function cookieHeaderFrom(res) {
  return res.setCookie.map((entry) => entry.split(';')[0]).join('; ');
}

main().catch((error) => {
  console.error('api-check crashed:', error);
  process.exitCode = 1;
});
