import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { NOT_FOUND } from '../common/api-responses';
import { PageDto, SearchQueryDto } from './dto/search.dto';
import { SearchService } from './search.service';

/**
 * Search — the stretch feature chosen in `PROPOSAL.md`: search, filter and
 * pagination, 10-ish per page (6, matching the prototype).
 *
 * A query parameter object rather than six loose `@Query()` arguments: it
 * validates `page` and `pageSize` as integers with bounds, which is where a
 * hand-written request would otherwise reach the database first and be
 * told off afterwards.
 */
@ApiTags('search')
@Controller('trees/:treeId/search')
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get()
  @ApiOperation({
    summary: 'Search people and memories in a tree',
    description:
      'Accent- and case-insensitive (`theary` finds `Theary`, `sokun` finds `Sokunthéary`), paginated, and filtered by FR-6.6 so a private memory is a hit only for its author.',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiOkResponse({ type: PageDto })
  @ApiNotFoundResponse(NOT_FOUND)
  find(
    @Param('treeId') treeId: string,
    @Query() query: SearchQueryDto,
  ): Promise<PageDto> {
    return this.service.search(treeId, query);
  }
}
