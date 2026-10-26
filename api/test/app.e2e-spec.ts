import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
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
      .post('/api/users')
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
      .post('/api/users')
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
