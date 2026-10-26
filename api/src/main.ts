import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  const origin = config.get<string>('CORS_ORIGIN', 'http://localhost:5173');

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
        'Authentication is not part of this milestone: M2 documents the resource contract, ' +
        'and M3 adds the session, the guards and the ownership checks that read the caller.',
    )
    .setVersion('1.0')
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
