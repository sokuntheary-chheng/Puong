import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * The database, made available everywhere without every feature module having
 * to import it. `@Global()` is right here — Prisma is infrastructure, not a
 * feature, and the alternative is the same import line in seven modules.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
