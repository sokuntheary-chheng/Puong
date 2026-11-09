import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  /**
   * Security headers, before anything that could send a body.
   *
   * The CSP is the one that matters: this API answers JSON, so a policy that
   * allows its own origin and nothing else costs nothing and removes the
   * "what if a value I reflect ends up in a page" question from every
   * response. `frame-ancestors` (via helmet's defaults) refuses to be framed,
   * which is the clickjacking half; `X-Content-Type-Options: nosniff`
   * refuses to let a browser guess that a JSON document is something else.
   *
   * One directive is relaxed on purpose: Swagger UI is served from this same
   * origin and needs to run its own inline bootstrap script. It is a
   * documentation page for an API whose contract is already public, and
   * blocking it would be a header that looks strict while teaching people to
   * disable headers.
   */
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'script-src': ["'self'", "'unsafe-inline'"],
          'connect-src': ["'self'"],
        },
      },
      /* The SPA and the API share an origin behind nginx, and the API never
         serves a cross-origin image, font or iframe of its own. */
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  );

  /**
   * The session arrives as a cookie, so the request has to have one before
   * any route — or the global guard — can read it. Express does not parse
   * cookies by default; without this line `req.cookies` is undefined and
   * every request looks signed out.
   */
  app.use(cookieParser());

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  const origin = config.get<string>('CORS_ORIGIN', 'http://localhost:5173');

  /**
   * Who the API thinks is calling — the key every rate limit is counted by.
   *
   * Behind nginx all requests arrive from the proxy's own address, so
   * `req.ip` would name one address for the whole deployment and both the
   * throttler (`app.module.ts`) and `LoginThrottle` would limit *deployments*
   * instead of people. `trust proxy` makes Express take the client from
   * `X-Forwarded-For`, which `web/nginx.conf` sets on `/api/`.
   *
   * It is off unless asked for, on purpose: if the API can be reached
   * directly, that header is one a client writes for itself, and a limit
   * whose key the caller chooses is no limit at all. Enable it only when the
   * proxy is the sole way in — which is what `docker-compose.yml` does.
   */
  const trustProxy = config.get<string>('TRUST_PROXY', 'false') === 'true';
  app.set('trust proxy', trustProxy ? 1 : false);

  /**
   * Everything lives under `/api`, so one origin serves the SPA and the API
   * in production without a path clash, and `http://localhost:5173` in
   * development never has to know that the API happens to be on port 3000.
   * Swagger follows the prefix and is served at `/api/docs`.
   */
  app.setGlobalPrefix('api');

  /**
   * The server's half of "the browser's word is not trusted" (IF-1.7).
   *
   * - `whitelist` — a property no DTO declares is stripped rather than
   *   written, so a client cannot add a column by inventing a field.
   * - `transform` — `?page=2` arrives as the number 2, so the DTO's `@IsInt`
   *   validates what the query means rather than what it looked like.
   * - ` forbidNonWhitelisted` — an undeclared property is a 400, not a
   *   silent drop: a client sending `ownerId` to PATCH a tree should be
   *   told it is not a field rather than wonder why nothing changed.
   *
   * Errors reach the client as `{ statusCode, message: string[], error }`
   * from the filter below, which is the shape every endpoint promises.
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  );

  app.useGlobalFilters(new ApiExceptionFilter());

  /**
   * CORS names one origin rather than opening the API to everybody: the
   * value comes from the environment, so development and production differ
   * by configuration instead of by a commented-out line.
   */
  app.enableCors({ origin, credentials: true });

  const swagger = new DocumentBuilder()
    .setTitle('Puong API')
    .setDescription(
      'A shared family archive — people, relations and memories, one tree at a time. ' +
        'Every endpoint except `POST /auth/register` and `POST /auth/login` needs a ' +
        'session: sign in there and the browser keeps the session as an `httpOnly`, ' +
        '`SameSite=Strict` cookie named `puong_session`. Routes under a tree are then ' +
        'checked against your role in that tree, and ownership (who created a person, ' +
        'who wrote a memory) is checked against the row itself.',
    )
    .setVersion('1.0')
    .addCookieAuth('puong_session', {
      type: 'apiKey',
      in: 'cookie',
      name: 'puong_session',
      description:
        'Set by `/auth/login`. Paste a value here to try a logged-in route from this page.',
    })
    .addTag('auth', 'Registration, login, logout, and who is signed in.')
    .addTag(
      'users',
      'Accounts. Passwords are hashed with bcrypt and never returned.',
    )
    .addTag('trees', 'The container every other resource is addressed through.')
    .addTag(
      'memberships',
      'Roles, scoped per tree — the only place a role exists.',
    )
    .addTag('people', 'Family members.')
    .addTag(
      'relations',
      'Parent, spouse, sibling and friend links between two people.',
    )
    .addTag('memories', 'Stories attached to a person, with FR-6.6 visibility.')
    .addTag('search', 'The stretch feature: search, filter and pagination.')
    .build();

  const document = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs/json',
  });

  await app.listen(port);

  console.log(`Puong API listening on http://localhost:${port}/api`);
  console.log(`Swagger UI        http://localhost:${port}/api/docs`);
}

void bootstrap();
