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
