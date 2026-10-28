import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { ApiExceptionFilter } from './../src/common/api-exception.filter';
import type { ErrorBody } from './../src/common/api-exception.filter';

/**
 * The error contract, exercised end to end.
 *
 * The full endpoint suite belongs to M4; what matters at M2 is the promise
 * every endpoint makes: **whatever goes wrong, the body looks the same** —
 * three fields, `message` always an array. Two cases cover the two producers
 * of that body: Nest's own validation pipe, and the router's 404 for a path
 * that does not exist.
 *
 * Both run against a real application (global pipe and filter included),
 * because a test that builds the controller alone would pass while the
 * filter that normalises the body was missing from `main.ts`.
 */
describe('Error contract (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Exactly the wiring `bootstrap()` performs, minus the listening socket.
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
      }),
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers an unknown route with the error body, message as an array', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/no-such-resource')
      .expect(404);

    expect(response.body).toEqual({
      statusCode: 404,
      message: [expect.any(String)],
      error: 'Not Found',
    });
  });

  it('answers an invalid body with 400 and one message per problem', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'not-an-email', displayName: 'A', password: 'short' })
      .expect(400);

    const body = response.body as ErrorBody;
    expect(body.statusCode).toBe(400);
    expect(body.error).toBe('Bad Request');
    expect(Array.isArray(body.message)).toBe(true);
    expect(body.message.length).toBeGreaterThanOrEqual(3);
  });

  it('refuses a property no DTO declares', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'reader@puong.dev',
        displayName: 'Reader',
        password: 'long-enough-password',
        passwordHash: 'a-bcrypt-lookalike',
      })
      .expect(400);

    const body = response.body as ErrorBody;
    expect(body.message.join(' ')).toContain('passwordHash');
  });
});

/**
 * The session, exercised end to end (M3).
 *
 * The first suite is about a *shape* — every error looks the same. This one
 * is about a *promise*: a route is closed without a cookie, open with one,
 * and the cookie itself is the `httpOnly`, `SameSite=Strict` value the SPA
 * relies on never being readable from script.
 *
 * It is self-contained: the account is registered by the test rather than
 * borrowed from the seed, so the suite passes against an empty database and
 * does not depend on demo data that a later run may have rewritten.
 */
describe('Session (e2e)', () => {
  let app: INestApplication<App>;
  let session = '';
  const email = `e2e-${Date.now()}@puong.dev`;
  const password = 'Passw0rd!';

  /**
   * What `/auth/register` and `/auth/login` answer: the account, and nothing
   * else. Typed here rather than read off `response.body` as `any`, because
   * an `any` assertion is how a test ends up checking a field that does not
   * exist and passing anyway.
   */
  interface AuthAnswer {
    user: { id: string; email: string; displayName: string };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
      }),
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const cookieHeader = (setCookie: string[] | string | undefined): string => {
    const list = Array.isArray(setCookie)
      ? setCookie
      : setCookie === undefined
        ? []
        : [setCookie];
    return list.map((entry) => entry.split(';')[0]).join('; ');
  };

  const rawSessionCookie = (
    setCookie: string[] | string | undefined,
  ): string => {
    const list = Array.isArray(setCookie)
      ? setCookie
      : setCookie === undefined
        ? []
        : [setCookie];
    return list.find((entry) => entry.startsWith('puong_session=')) ?? '';
  };

  it('registers and hands back an httpOnly cookie, never a token in the body', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, displayName: 'E2E Member', password })
      .expect(201);

    const body = response.body as AuthAnswer;
    expect(body.user.email).toBe(email);
    expect(body.user).not.toHaveProperty('passwordHash');

    // Nothing JWT-shaped anywhere in the payload: if the body carried the
    // token, `httpOnly` would be decoration rather than a guarantee.
    expect(JSON.stringify(response.body)).not.toContain('eyJ');

    const raw = rawSessionCookie(response.headers['set-cookie']);
    expect(raw).not.toBe('');
    expect(raw.toLowerCase()).toContain('httponly');
    expect(raw.toLowerCase()).toContain('samesite=strict');
    expect(raw.toLowerCase()).not.toContain('secure'); // http on localhost

    session = cookieHeader(response.headers['set-cookie']);
  });

  it('closes every guarded route without a cookie', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    await request(app.getHttpServer()).get('/api/users').expect(401);
    await request(app.getHttpServer())
      .post('/api/trees')
      .send({ name: 'Nobody is signed in' })
      .expect(401);
    await request(app.getHttpServer()).get('/api/trees/t1/people').expect(401);
  });

  it('signs in, and refuses the wrong password with the same message', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'definitely-not-it' })
      .expect(401)
      .expect((res) => {
        const body = res.body as ErrorBody;
        expect(body.message).toEqual(['Email or password is incorrect.']);
      });

    const wrongUser = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'nobody-at-all@puong.dev', password })
      .expect(401);

    // The unknown address and the wrong password are indistinguishable.
    expect((wrongUser.body as ErrorBody).message).toEqual([
      'Email or password is incorrect.',
    ]);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200)
      .expect((res) => {
        const body = res.body as AuthAnswer;
        expect(body.user.email).toBe(email);
        expect(JSON.stringify(res.body)).not.toContain('eyJ');
      });
  });

  it('reads the account back through /auth/me with the cookie', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', session)
      .expect(200);

    const body = response.body as { email: string };
    expect(body.email).toBe(email);
    expect(body).not.toHaveProperty('passwordHash');
  });

  it('refuses a state-changing request that claims to come from another site', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/trees')
      .set('Cookie', session)
      .set('Origin', 'https://attacker.example')
      .send({ name: 'Taken over' })
      .expect(403);

    expect((response.body as ErrorBody).statusCode).toBe(403);
  });

  it('clears the cookie on logout', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', session)
      .expect(204);

    const raw = rawSessionCookie(response.headers['set-cookie']);
    expect(raw).toContain('puong_session=;');
    expect(raw.toLowerCase()).toContain('expires=thu, 01 jan 1970');
  });

  /**
   * Signing out has to reach the server, not just the browser's cookie jar.
   *
   * `session` is the cookie issued before the logout above: its signature is
   * still valid and it has not expired, so the only thing that can refuse it
   * is the revocation stamp `logout` wrote. Without server-side revocation
   * this test would pass a client that merely deleted its own cookie while a
   * copy of the token kept working for the rest of its seven days.
   */
  it('refuses the token that logout revoked, even though its signature is valid', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', session)
      .expect(401);

    const body = response.body as ErrorBody;
    expect(body.statusCode).toBe(401);
    expect(body.message).toEqual(['Your session has expired. Sign in again.']);
    // The server tells the browser to drop the now-worthless cookie too.
    expect(rawSessionCookie(response.headers['set-cookie'])).toContain(
      'puong_session=;',
    );
  });

  /**
   * Signing back in still works after the revocation: `sessionRevokedAt` is
   * a line in time, and a token issued after it has a later `iat`.
   */
  it('issues a fresh session after a revoked one', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    const fresh = cookieHeader(response.headers['set-cookie']);
    expect(fresh).toContain('puong_session=');

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', fresh)
      .expect(200);
  });
});

/**
 * Rate limiting (M3), on its own application so the counter starts empty.
 *
 * The limit protects the routes that answer a password: `login` and
 * `register` each drop from 600 a minute to ten. Two things are being
 * proved here, because the second is the one that goes wrong quietly:
 *
 * 1. the eleventh sign-in attempt inside a minute is a 429 in the standard
 *    error body, and
 * 2. exhausting that limit does **not** touch the rest of the API — `GET
 *    /api/trees` still answers 401 rather than 429, because the guard keys
 *    every counter by route as well as by address. One shared counter would
 *    let a login loop lock a member out of browsing their own tree.
 */
describe('Rate limiting (e2e)', () => {
  let app: INestApplication<App>;
  const email = `throttle-${Date.now()}@puong.dev`;
  const password = 'Passw0rd!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
      }),
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers the eleventh sign-in attempt in a minute with 429', async () => {
    // Ten attempts at an account that does not exist: every one is a real
    // guess against the password, which is exactly what the limit counts.
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password })
        .expect(401);
    }

    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(429);

    const body = response.body as ErrorBody;
    expect(body.statusCode).toBe(429);
    expect(body.message).toEqual([
      'Too many requests. Wait a moment and try again.',
    ]);
    expect(body.error).toBe('Too Many Requests');
  });

  it('keeps the rest of the API open while sign-in is throttled', async () => {
    // Still throttled on the route that ran out…
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(429);

    // …and nowhere else. `register` has its own counter, so a rejected body
    // still reaches validation (400) instead of the limiter (429); the
    // guarded routes answer their normal 401.
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, displayName: 'Blocked', password: 'short' })
      .expect(400);
    await request(app.getHttpServer()).get('/api/trees').expect(401);
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });
});

/* ==================================================================== *
 * M4 — every story, end to end.                                        *
 *                                                                      *
 * One application, one seeded database, three sessions. The suites run  *
 * in the order the stories build on each other: story 2's invitation is *
 * what makes story 10 possible (the invitee must be a member before    *
 * they can be nominated), and story 9 asserts its counts against tree   *
 * `t1` *before* the later suites add anything to it — so `npm run seed` *
 * followed by `npm run test:e2e` is a repeatable pair rather than a     *
 * sequence that slowly rots.                                           *
 * ==================================================================== */

/** The application exactly as `main.ts` builds it: prefix, cookies, pipe, filter. */
async function createM4App(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.init();
  return app;
}

/** The password every seeded account accepts (`prisma/seed.ts`). */
const M4_PASSWORD = 'Passw0rd!';

/** Reads a response body as a shape, so no `any` escapes into an assertion. */
function json<T>(response: { body: unknown }): T {
  return response.body as T;
}

/** The `httpOnly` session cookie one account signs in with. */
async function signIn(server: App, email: string): Promise<string> {
  const response = await request(server)
    .post('/api/auth/login')
    .send({ email, password: M4_PASSWORD });

  const setCookie = response.headers['set-cookie'] as string[] | string;
  const list = Array.isArray(setCookie)
    ? setCookie
    : setCookie === undefined
      ? []
      : [setCookie];
  return list.map((entry) => entry.split(';')[0]).join('; ');
}

describe('M4 stories (e2e)', () => {
  let app: INestApplication;
  let owner: string;
  let contributor: string;
  let viewer: string;

  /* Written by one suite and read by the next, in declaration order. */
  let invitationId = '';
  let uploadedUrl = '';
  let personA = '';
  let personB = '';
  let personC = '';

  const api = (): ReturnType<typeof request> =>
    request(app.getHttpServer() as App);

  beforeAll(async () => {
    app = await createM4App();
    const server = app.getHttpServer() as App;
    owner = await signIn(server, 'owner@puong.dev');
    contributor = await signIn(server, 'contributor@puong.dev');
    viewer = await signIn(server, 'viewer@puong.dev');
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  /* ------------------------------------------------------------------ *
   * Story 2 — invitations (FR-3). The seed's invitation to viewer@ is  *
   * dated 2026-09-06, so by construction it is expired: it is the one  *
   * fixture that proves FR-3.4 without a clock the test has to wait on. *
   * ------------------------------------------------------------------ */
  describe('story 2 — inviting a relative by email (FR-3)', () => {
    it('keeps an invitation whose seven days ran out off the home page (FR-3.4)', async () => {
      const response = await api()
        .get('/api/memberships/mine')
        .set('Cookie', viewer)
        .expect(200);

      const invitations = json<Array<{ treeId: string }>>(response);
      expect(invitations.map((invitation) => invitation.treeId)).not.toContain(
        't2',
      );
    });

    it('refuses to accept that expired invitation instead of reviving it (FR-3.4)', async () => {
      const response = await api()
        .patch('/api/memberships/mb5')
        .set('Cookie', viewer)
        .send({ status: 'ACTIVE' })
        .expect(409);

      expect(json<ErrorBody>(response).message.join(' ')).toMatch(/expired/i);
    });

    it('invites an existing address with a role (FR-3.1)', async () => {
      const response = await api()
        .post('/api/trees/t2/members')
        .set('Cookie', owner)
        .send({ email: 'contributor@puong.dev', role: 'CONTRIBUTOR' })
        .expect(201);

      const membership = json<{
        id: string;
        status: string;
        invitedAt: string;
      }>(response);
      invitationId = membership.id;
      expect(membership.status).toBe('INVITED');
      expect(membership.invitedAt).toBeTruthy();
    });

    it('shows it on the invitee’s page with the tree and the day it expires (FR-3.2)', async () => {
      const response = await api()
        .get('/api/memberships/mine')
        .set('Cookie', contributor)
        .expect(200);

      const invitation = json<
        Array<{
          treeId: string;
          treeName: string;
          role: string;
          invitedAt: string;
          expiresAt: string;
        }>
      >(response).find((row) => row.treeId === 't2');

      expect(invitation).toBeDefined();
      const found = invitation as NonNullable<typeof invitation>;
      expect(found.treeName).toBe('Mangosteen family');
      expect(found.role).toBe('CONTRIBUTOR');
      expect(
        new Date(found.expiresAt).getTime() -
          new Date(found.invitedAt).getTime(),
      ).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('refuses an address with no account, and stores nothing (FR-3.1)', async () => {
      const response = await api()
        .post('/api/trees/t2/members')
        .set('Cookie', owner)
        .send({ email: 'nobody-at-all@puong.dev', role: 'VIEWER' })
        .expect(404);

      expect(json<ErrorBody>(response).message.join(' ')).toMatch(/register/i);
    });

    it('keeps the tree out of their list until they accept (FR-3.5)', async () => {
      const before = await api()
        .get('/api/trees')
        .set('Cookie', contributor)
        .expect(200);
      expect(
        json<Array<{ id: string }>>(before).map((tree) => tree.id),
      ).not.toContain('t2');

      await api()
        .patch(`/api/memberships/${invitationId}`)
        .set('Cookie', contributor)
        .send({ status: 'ACTIVE' })
        .expect(200);

      const after = await api()
        .get('/api/trees')
        .set('Cookie', contributor)
        .expect(200);
      expect(
        json<Array<{ id: string }>>(after).map((tree) => tree.id),
      ).toContain('t2');
    });

    it('lets a viewer invite nobody (FR-3.1 → 403)', async () => {
      await api()
        .post('/api/trees/t1/members')
        .set('Cookie', viewer)
        .send({ email: 'contributor@puong.dev', role: 'OWNER' })
        .expect(403);
    });
  });

  /* ------------------------------------------------------------------ *
   * Story 10 — succession (FR-9), on the Mangosteen tree, whose two     *
   * members are now owner@ (OWNER) and contributor@ (newly ACTIVE).     *
   * ------------------------------------------------------------------ */
  describe('story 10 — handing the tree to a successor (FR-9)', () => {
    it('refuses a nominee who is not a member of this tree (FR-9.1 → 404)', async () => {
      const response = await api()
        .patch('/api/trees/t2')
        .set('Cookie', owner)
        .send({ successorId: 'not-a-member-of-this-tree' })
        .expect(404);

      expect(json<ErrorBody>(response).message.join(' ')).toMatch(
        /active member/i,
      );
    });

    it('records the nomination with the day it was made (FR-9.1)', async () => {
      await api()
        .patch('/api/trees/t2')
        .set('Cookie', owner)
        .send({ successorId: 'u2' })
        .expect(200);

      const response = await api()
        .get('/api/trees/t2/successor')
        .set('Cookie', owner)
        .expect(200);

      const successor = json<{
        successorId: string | null;
        nominatedAt: string | null;
        ownerId: string;
        ownerName: string;
        ownershipTransferredAt: string | null;
      }>(response);

      expect(successor.successorId).toBe('u2');
      expect(successor.nominatedAt).toBeTruthy();
      expect(successor.ownerId).toBe('u1');
      expect(successor.ownerName).toBe('Sokuntheary Chheng');
      expect(successor.ownershipTransferredAt).toBeNull();
    });

    it('presents the pending nomination to the successor and to nobody else (FR-9.1)', async () => {
      const mine = await api()
        .get('/api/successorships')
        .set('Cookie', contributor)
        .expect(200);

      const waiting = json<
        Array<{
          treeId: string;
          treeName: string;
          ownerName: string;
          nominatedAt: string;
        }>
      >(mine).find((row) => row.treeId === 't2');

      expect(waiting).toBeDefined();
      const found = waiting as NonNullable<typeof waiting>;
      expect(found.treeName).toBe('Mangosteen family');
      expect(found.ownerName).toBe('Sokuntheary Chheng');
      expect(found.nominatedAt).toBeTruthy();

      const others = await api()
        .get('/api/successorships')
        .set('Cookie', viewer)
        .expect(200);
      expect(json<unknown[]>(others)).toEqual([]);

      await api().get('/api/successorships').expect(401);
    });

    it('refuses the owner answering their own nomination (FR-9.2 → 403)', async () => {
      await api()
        .post('/api/trees/t2/successor/accept')
        .set('Cookie', owner)
        .expect(403);
    });

    it('moves ownership in one step and records where it came from (FR-9.2, FR-9.3)', async () => {
      await api()
        .post('/api/trees/t2/successor/accept')
        .set('Cookie', contributor)
        .expect(200);

      const response = await api()
        .get('/api/trees/t2/successor')
        .set('Cookie', contributor)
        .expect(200);

      const successor = json<{
        successorId: string | null;
        ownerId: string;
        previousOwnerId: string | null;
        ownershipTransferredAt: string | null;
      }>(response);

      expect(successor.successorId).toBeNull();
      expect(successor.ownerId).toBe('u2');
      expect(successor.previousOwnerId).toBe('u1');
      expect(successor.ownershipTransferredAt).toBeTruthy();
    });

    it('demotes the previous owner instead of removing them (FR-9.2)', async () => {
      const response = await api()
        .get('/api/trees/t2/members')
        .set('Cookie', contributor)
        .expect(200);

      const members =
        json<Array<{ userId: string; role: string; status: string }>>(response);

      expect(members).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            userId: 'u1',
            role: 'CONTRIBUTOR',
            status: 'ACTIVE',
          }),
          expect.objectContaining({
            userId: 'u2',
            role: 'OWNER',
            status: 'ACTIVE',
          }),
        ]),
      );
    });

    it('lets the new owner nominate back, and the nominee decline (FR-9.2)', async () => {
      await api()
        .patch('/api/trees/t2')
        .set('Cookie', contributor)
        .send({ successorId: 'u1' })
        .expect(200);

      await api()
        .post('/api/trees/t2/successor/decline')
        .set('Cookie', owner)
        .expect(200);

      const response = await api()
        .get('/api/trees/t2/successor')
        .set('Cookie', owner)
        .expect(200);

      const successor = json<{
        successorId: string | null;
        nominatedAt: string | null;
      }>(response);
      expect(successor.successorId).toBeNull();
      expect(successor.nominatedAt).toBeNull();
    });

    it('409s an accept when there is nothing waiting (FR-9.2)', async () => {
      const response = await api()
        .post('/api/trees/t2/successor/accept')
        .set('Cookie', contributor)
        .expect(409);

      expect(json<ErrorBody>(response).message.join(' ')).toMatch(
        /no nomination waiting/i,
      );
    });
  });

  /* ------------------------------------------------------------------ *
   * Story 9 — the stretch feature: search, filters, ten per page.       *
   * Asserted against the untouched seed, before any suite below adds a  *
   * row to it.                                                          *
   * ------------------------------------------------------------------ */
  describe('story 9 — search, filters and ten per page (FR-7)', () => {
    interface SearchItem {
      kind: string;
      person?: { id: string };
      memory?: { id: string };
    }
    interface SearchPage {
      items: SearchItem[];
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    }

    const search = async (
      query: Record<string, string>,
      cookie: string,
    ): Promise<SearchPage> =>
      json<SearchPage>(
        await api()
          .get('/api/trees/t1/search')
          .query(query)
          .set('Cookie', cookie)
          .expect(200),
      );

    const personIds = (page: SearchPage): string[] =>
      page.items.flatMap((item) => (item.person ? [item.person.id] : []));

    it('answers an empty search with nothing rather than the whole family', async () => {
      const page = await search({ q: '' }, viewer);

      expect(page.items).toEqual([]);
      expect(page.total).toBe(0);
      expect(page.totalPages).toBe(0);
    });

    it('returns ten results a page by default, and a real next page (FR-7.3)', async () => {
      const first = await search({ q: 'a' }, viewer);

      expect(first.pageSize).toBe(10);
      expect(first.page).toBe(1);
      expect(first.total).toBeGreaterThan(10);
      expect(first.items).toHaveLength(10);
      expect(first.totalPages).toBe(Math.ceil(first.total / 10));

      const second = await search({ q: 'a', page: '2' }, viewer);
      expect(second.page).toBe(2);
      expect(second.items).toHaveLength(10);
      expect(second.items).not.toEqual(first.items);
    });

    it('matches a name typed without its accents (FR-7.1)', async () => {
      const page = await search({ q: 'theary' }, viewer);

      // Two people; the third match is `mm4`, a PRIVATE memory the viewer
      // is not its author and may not see (FR-6.6 applies to search too).
      expect(personIds(page)).toEqual(['p09', 'p16']);
      expect(page.total).toBe(2);

      const asAuthor = await search({ q: 'theary' }, contributor);
      expect(asAuthor.total).toBe(3);
      expect(asAuthor.items.map((item) => item.memory?.id)).toContain('mm4');
    });

    it('filters people by living status (FR-7.2)', async () => {
      const deceased = await search({ q: '', living: 'false' }, viewer);

      expect(personIds(deceased)).toEqual(['p01', 'p07']);
      expect(deceased.items.every((item) => item.kind === 'person')).toBe(true);
    });

    it('filters people by the generation the family rule places them in (FR-7.2)', async () => {
      const roots = await search({ q: '', generation: '0' }, viewer);

      // Alphabetical by name, which is the order every list on the page is in.
      expect(personIds(roots).sort()).toEqual(['p01', 'p02', 'p23']);
    });

    it('filters people by relation type, keeping both ends of the pair (FR-7.2)', async () => {
      const married = await search(
        { q: '', relation: 'SPOUSE', pageSize: '50' },
        viewer,
      );

      expect(married.total).toBe(16);
      expect(personIds(married)).toEqual(
        expect.arrayContaining(['p01', 'p02', 'p15', 'p16']),
      );
    });

    it('refuses a filter aimed at memories, which have no generation (FR-7.2)', async () => {
      const response = await api()
        .get('/api/trees/t1/search')
        .query({ q: '', kind: 'memories', living: 'true' })
        .set('Cookie', viewer)
        .expect(400);

      expect(json<ErrorBody>(response).message.join(' ')).toMatch(
        /filter people/i,
      );
    });

    it('keeps another member’s private memory out of the results (FR-6.6)', async () => {
      const asReader = await search(
        { q: 'private', kind: 'memories' },
        contributor,
      );
      expect(asReader.total).toBe(0);

      const asAuthor = await search({ q: 'private', kind: 'memories' }, owner);
      expect(asAuthor.total).toBe(1);
      expect(asAuthor.items[0].memory?.id).toBe('mm3');
    });
  });

  /* ------------------------------------------------------------------ *
   * Story 6 — the photograph half: upload, then attach, then serve.     *
   * ------------------------------------------------------------------ */
  describe('story 6 — a photograph, uploaded and served (FR-6.2, FR-6.3)', () => {
    /** A one-pixel PNG; multer checks the type, not the pixels. */
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );

    it('refuses an upload with no session', async () => {
      await api()
        .post('/api/uploads/photos')
        .attach('file', png, { filename: 'one.png', contentType: 'image/png' })
        .expect(401);
    });

    it('stores a PNG and returns the url to keep (FR-6.2)', async () => {
      const response = await api()
        .post('/api/uploads/photos')
        .set('Cookie', contributor)
        .attach('file', png, { filename: 'one.png', contentType: 'image/png' })
        .expect(201);

      const photo = json<{ url: string; filename: string; sizeBytes: number }>(
        response,
      );
      uploadedUrl = photo.url;

      expect(photo.url).toMatch(/^\/api\/uploads\/[a-f0-9]{32}\.png$/);
      expect(photo.filename).toBe(photo.url.split('/').pop());
      expect(photo.sizeBytes).toBe(png.length);
    });

    it('refuses a file that is not a photograph, and says which types are allowed (FR-6.2)', async () => {
      const response = await api()
        .post('/api/uploads/photos')
        .set('Cookie', contributor)
        .attach('file', Buffer.from('this is a note'), {
          filename: 'note.txt',
          contentType: 'text/plain',
        })
        .expect(400);

      expect(json<ErrorBody>(response).message.join(' ')).toMatch(
        /JPEG, a PNG or a WebP/,
      );
    });

    it('refuses a photograph over 5 MB and says by how much (FR-6.2)', async () => {
      const oversized = Buffer.alloc(5 * 1024 * 1024 + 512 * 1024, 7);

      const response = await api()
        .post('/api/uploads/photos')
        .set('Cookie', contributor)
        .attach('file', oversized, {
          filename: 'huge.png',
          contentType: 'image/png',
        })
        .expect(400);

      expect(json<ErrorBody>(response).message.join(' ')).toMatch(
        /at most 5 MB/,
      );
    });

    it('serves it to a signed-in member, with the type it was stored as (FR-6.3)', async () => {
      const response = await api()
        .get(uploadedUrl)
        .set('Cookie', viewer)
        .expect(200);

      expect(String(response.headers['content-type'])).toContain('image/png');
      expect(json<Buffer>(response).length).toBe(png.length);
    });

    it('401s the same url to a stranger with no session (FR-6.6)', async () => {
      await api().get(uploadedUrl).expect(401);
    });

    it('404s a name this API never generated, traversal included', async () => {
      await api()
        .get('/api/uploads/not-generated.png')
        .set('Cookie', viewer)
        .expect(404);
      await api()
        .get('/api/uploads/..%2f..%2fpackage.json')
        .set('Cookie', viewer)
        .expect(404);
    });

    it('accepts the returned url when the photograph is attached to a memory (story 6)', async () => {
      const response = await api()
        .post('/api/trees/t1/memories')
        .set('Cookie', contributor)
        .send({
          personId: 'p03',
          title: 'The photograph above the stove',
          body: 'Uploaded during M4.',
          visibility: 'TREE',
          photoUrl: uploadedUrl,
        })
        .expect(201);

      expect(json<{ photoUrl: string }>(response).photoUrl).toBe(uploadedUrl);
    });

    it('400s a photo url that is not one of ours', async () => {
      const response = await api()
        .post('/api/trees/t2/people')
        .set('Cookie', owner)
        .send({
          fullName: 'Nobody In Particular',
          photoUrl: 'https://someone-elses-server.example/photo.jpg',
        })
        .expect(400);

      expect(json<ErrorBody>(response).message.join(' ')).toMatch(/uploaded/i);
    });
  });

  /* ------------------------------------------------------------------ *
   * Stories 4 and 5 — people and the links between them, written into   *
   * the Mangosteen tree (which starts empty), by the account the         *
   * succession above demoted to CONTRIBUTOR.                            *
   * ------------------------------------------------------------------ */
  describe('story 4 — adding a person (FR-4)', () => {
    it('requires a name (FR-4.1 → 400)', async () => {
      const response = await api()
        .post('/api/trees/t2/people')
        .set('Cookie', owner)
        .send({})
        .expect(400);

      expect(json<ErrorBody>(response).message.join(' ')).toMatch(/fullName/);
    });

    it('rejects a death date before the birth date with a clear message (FR-4.2 → 400)', async () => {
      const response = await api()
        .post('/api/trees/t2/people')
        .set('Cookie', owner)
        .send({
          fullName: 'Impossible Dates',
          birthDate: '2000-01-01',
          deathDate: '1990-01-01',
        })
        .expect(400);

      expect(json<ErrorBody>(response).message.join(' ')).toMatch(
        /must not be before birthDate/,
      );
    });

    it('adds them, recorded against whoever added them (FR-4.4)', async () => {
      const response = await api()
        .post('/api/trees/t2/people')
        .set('Cookie', owner)
        .send({ fullName: 'Aunt Srey Long', birthDate: '1970-05-04' })
        .expect(201);

      const person = json<{
        id: string;
        treeId: string;
        createdById: string;
        isLiving: boolean;
      }>(response);
      personA = person.id;

      expect(person.treeId).toBe('t2');
      expect(person.createdById).toBe('u1');
      expect(person.isLiving).toBe(true);

      const list = await api()
        .get('/api/trees/t2/people')
        .set('Cookie', owner)
        .expect(200);
      expect(json<Array<{ id: string }>>(list).map((row) => row.id)).toContain(
        personA,
      );
    });
  });

  describe('story 5 — linking a person to their relatives (FR-5)', () => {
    it('makes the second and third person to link against', async () => {
      const born = async (fullName: string): Promise<string> => {
        const response = await api()
          .post('/api/trees/t2/people')
          .set('Cookie', owner)
          .send({ fullName })
          .expect(201);
        return json<{ id: string }>(response).id;
      };

      personB = await born('Chan Sophoeun');
      personC = await born('Chan Dara');
      expect(personB).toBeTruthy();
      expect(personC).toBeTruthy();
    });

    it('refuses a link from a person to themselves (FR-5.3 → 400)', async () => {
      const response = await api()
        .post('/api/trees/t2/relations')
        .set('Cookie', owner)
        .send({ fromId: personA, toId: personA, type: 'SPOUSE' })
        .expect(400);

      expect(json<ErrorBody>(response).message.join(' ')).toMatch(
        /themselves/i,
      );
    });

    it('refuses a person who belongs to another family (FR-5.1 → 404)', async () => {
      await api()
        .post('/api/trees/t2/relations')
        .set('Cookie', owner)
        .send({ fromId: personA, toId: 'p01', type: 'PARENT' })
        .expect(404);
    });

    it('writes a parent link (FR-5.1)', async () => {
      const response = await api()
        .post('/api/trees/t2/relations')
        .set('Cookie', owner)
        .send({ fromId: personA, toId: personB, type: 'PARENT' })
        .expect(201);

      expect(json<{ type: string }>(response).type).toBe('PARENT');
    });

    it('refuses the same link twice (FR-5.2 → 409)', async () => {
      await api()
        .post('/api/trees/t2/relations')
        .set('Cookie', owner)
        .send({ fromId: personA, toId: personB, type: 'PARENT' })
        .expect(409);
    });

    it('refuses a link that would close the family into a loop (FR-5.4 → 409)', async () => {
      await api()
        .post('/api/trees/t2/relations')
        .set('Cookie', owner)
        .send({ fromId: personB, toId: personC, type: 'PARENT' })
        .expect(201);

      /* A is B's parent and B is C's parent, so making C the parent of A
         would walk back to A forever. */
      const response = await api()
        .post('/api/trees/t2/relations')
        .set('Cookie', owner)
        .send({ fromId: personC, toId: personA, type: 'PARENT' })
        .expect(409);

      expect(json<ErrorBody>(response).message.join(' ')).toMatch(
        /own ancestor|loop/i,
      );
    });

    it('refuses a contributor who is not a member of that tree (FR-3.6 → 404)', async () => {
      await api()
        .post('/api/trees/t2/relations')
        .set('Cookie', viewer)
        .send({ fromId: personA, toId: personC, type: 'SPOUSE' })
        .expect(404);
    });
  });

  /* ------------------------------------------------------------------ *
   * Story 7 — the ownership half of edit and delete, asserted against   *
   * the untouched seed in tree `t1`: p03 and mm2 are other people's     *
   * work as far as contributor@ is concerned.                           *
   * ------------------------------------------------------------------ */
  describe('story 7 — only your own contributions (FR-4.4, FR-6.5)', () => {
    it('refuses a contributor editing somebody else’s person (FR-4.4 → 403)', async () => {
      const response = await api()
        .patch('/api/trees/t1/people/p03')
        .set('Cookie', contributor)
        .send({ nickname: 'Not mine to rename' })
        .expect(403);

      expect(json<ErrorBody>(response).message.join(' ')).toMatch(
        /added this record|owner of the tree/i,
      );
    });

    it('refuses a contributor deleting somebody else’s person (FR-4.5 → 403)', async () => {
      await api()
        .delete('/api/trees/t1/people/p03')
        .set('Cookie', contributor)
        .expect(403);
    });

    it('lets the owner of the tree curate the whole family (FR-4.5)', async () => {
      const response = await api()
        .patch('/api/trees/t1/people/p03')
        .set('Cookie', owner)
        .send({ nickname: 'Jack' })
        .expect(200);

      expect(json<{ nickname: string }>(response).nickname).toBe('Jack');
    });

    it('refuses the owner rewriting a memory they did not write (FR-6.5 → 403)', async () => {
      const response = await api()
        .patch('/api/trees/t1/memories/mm2')
        .set('Cookie', owner)
        .send({ title: 'Not the owner’s words' })
        .expect(403);

      expect(json<ErrorBody>(response).message.join(' ')).toMatch(
        /Only the person who wrote/i,
      );
    });

    it('lets the author correct their own memory (FR-6.5)', async () => {
      const response = await api()
        .patch('/api/trees/t1/memories/mm2')
        .set('Cookie', contributor)
        .send({ title: 'Lunar New Year 2005' })
        .expect(200);

      expect(json<{ title: string; authorId: string }>(response).authorId).toBe(
        'u2',
      );
    });

    it('hides a private memory from everyone but its author, as a 404 (FR-6.6)', async () => {
      await api()
        .get('/api/trees/t1/memories/mm3')
        .set('Cookie', contributor)
        .expect(404);

      await api()
        .get('/api/trees/t1/memories/mm3')
        .set('Cookie', owner)
        .expect(200);
    });
  });
});
