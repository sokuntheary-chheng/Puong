import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { NOT_FOUND } from '../common/api-responses';
import type { Actor } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequireRole, TreeRoleGuard } from '../auth/tree-role.guard';
import { PageDto, SearchQueryDto } from './dto/search.dto';
import { SearchService } from './search.service';

/**
 * Search — the stretch feature chosen in `PROPOSAL.md`: search, filter and
 * pagination, 10 per page (FR-7.3), with FR-7.2's three filters.
 *
 * A query parameter object rather than six loose `@Query()` arguments: it
 * validates `page` and `pageSize` as integers with bounds, which is where a
 * hand-written request would otherwise reach the database first and be
 * told off afterwards.
 *
 * The viewer is *not* one of those parameters: FR-6.6 has to hold against
 * search exactly as it holds against the list, and a `viewerId` a client
 * could type would make search the way around the rule the list enforces.
 */
@ApiTags('search')
@Controller('trees/:treeId/search')
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get()
  @UseGuards(TreeRoleGuard)
  @RequireRole('VIEWER')
  @ApiOperation({
    summary: 'Search people and memories in a tree',
    description:
      'Accent- and case-insensitive (`theary` finds `Theary`, `sokun` finds `Sokunthéary`), paginated, and filtered by FR-6.6 so a private memory is a hit only for its author — the author being the signed-in account, not a query parameter.',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiOkResponse({ type: PageDto })
  @ApiNotFoundResponse(NOT_FOUND)
  find(
    @Param('treeId') treeId: string,
    @Query() query: SearchQueryDto,
    @CurrentUser() actor: Actor,
  ): Promise<PageDto> {
    return this.service.search(treeId, query, actor.id);
  }
}
