import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * One Prisma client for the whole application.
 *
 * A single connection pool is held for the process rather than a client per
 * request: opening and closing PostgreSQL connections per call is the classic
 * way to exhaust a pool under load, and nothing in this API needs a client of
 * its own.
 *
 * Injected into services only — no controller ever talks to the database, so
 * the rule "a controller translates HTTP, a service owns the data" stays true
 * and the service layer can be tested without an HTTP server.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
