import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * Accounts: who a human is, and how their password is stored.
 *
 * Exported rather than global — only modules that need to resolve an author
 * or an owner import it, which keeps the dependency graph readable.
 */
@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
