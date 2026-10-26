import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
    UsersModule,
    TreesModule,
    MembershipsModule,
    PeopleModule,
    RelationsModule,
    MemoriesModule,
    SearchModule,
  ],
})
export class AppModule {}
