import { Module } from '@nestjs/common';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';

/**
 * Memberships — the join table with an opinion.
 *
 * This is where the M3 authorisation rules will be read from (`role`) and
 * where "is this account in this tree at all" is answered (`status`), so the
 * service is exported even though no other module calls it yet: guards live
 * beside the resource they guard, not inside every controller that needs it.
 */
@Module({
  controllers: [MembershipsController],
  providers: [MembershipsService],
  exports: [MembershipsService],
})
export class MembershipsModule {}
