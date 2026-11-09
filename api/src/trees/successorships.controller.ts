import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Actor } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SuccessorshipDto } from './dto/trees.dto';
import { TreesService } from './trees.service';

/**
 * The nomination waiting on *this* account — FR-9.1's "present the pending
 * nomination to that successor".
 *
 * A separate path (`/successorships`, not `/trees/:id/…`) because it is
 * deliberately **not** about one tree: it is the answer to "is anybody
 * waiting for me?", and making the home page ask once per tree would turn
 * the first screen after sign-in into a request per family the moment
 * somebody is in more than one.
 *
 * The guard is the session alone. Every row this returns was written by an
 * owner who nominated this very account, so the ownership question has
 * already been answered by the data — there is no tree id in the path for a
 * role guard to check, and no other account's nominations to leak, because
 * `userId` is the caller's (FR-9.1).
 */
@ApiTags('successorships')
@Controller('successorships')
export class SuccessorshipsController {
  constructor(private readonly trees: TreesService) {}

  @Get()
  @ApiOperation({
    summary: 'Trees that have nominated me as successor (FR-9.1)',
    description:
      'The banner on the successor’s home page: every pending nomination for the signed-in account, each with the tree, its owner and the day it was made. Empty array when nobody is waiting.',
  })
  @ApiOkResponse({ type: [SuccessorshipDto] })
  list(@CurrentUser() actor: Actor): Promise<SuccessorshipDto[]> {
    return this.trees.successorships(actor.id);
  }
}
