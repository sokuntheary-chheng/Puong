import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { MemoriesModule } from './memories/memories.module';
import { MembershipsModule } from './memberships/memberships.module';
import { PeopleModule } from './people/people.module';
import { PrismaModule } from './prisma/prisma.module';
import { RelationsModule } from './relations/relations.module';
import { SearchModule } from './search/search.module';
import { TreesModule } from './trees/trees.module';
import { UsersModule } from './users/users.module';

/**
 * The application root.
 *
 * One module per resource, as the M2 checklist asks — `Users`, `Trees`,
 * `Memberships`, `People`, `Relations`, `Memories`, `Search` — plus
 * `PrismaModule`, which is global so that infrastructure is written once
 * instead of imported seven times.
 *
 * `ConfigModule` reads `.env` once, here, for everyone: `DATABASE_URL`,
 * `PORT`, `CORS_ORIGIN` and `JWT_SECRET` are all environment, and none of
 * them belongs in a committed file.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    /**
     * Rate limiting, before `AuthModule` so the counter is the first thing
     * a request meets.
     *
     * 600 requests a minute is far above anything the SPA does — it is a
     * backstop against a runaway loop or a scrape, not a policy for people.
     * The limit anybody would actually argue about, ten sign-in attempts a
     * minute, is declared on the two routes that answer a password
     * (`auth.controller.ts`) as a tighter override of this same throttler.
     *
     * Counter keys include the route (`AuthController-login-…-<ip>`), so a
     * login loop cannot eat the budget of `GET /api/trees`, and no request
     * can be throttled by an endpoint it never touched.
     *
     * Behind nginx every client arrives from the same container address, so
     * this counts per *deployment* rather than per person — acceptable for a
     * single-user demo, and worth a `X-Forwarded-For`-aware tracker before
     * this is exposed to the internet (docs/security.md).
     *
     * `ttl` is milliseconds in @nestjs/throttler v6.
     */
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 600 }],
    }),
    /* AuthModule next, and global: it registers the `APP_GUARD` that every
       module below is protected by, so the dependency reads in the order the
       request is checked — rate, session, tree role, handler. */
    AuthModule,
    UsersModule,
    TreesModule,
    MembershipsModule,
    PeopleModule,
    RelationsModule,
    MemoriesModule,
    SearchModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
