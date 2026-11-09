import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  BAD_REQUEST,
  CONFLICT,
  FORBIDDEN,
  NOT_FOUND,
} from '../common/api-responses';
import { RequireRole, TreeRoleGuard } from '../auth/tree-role.guard';
import { CreateRelationDto, RelationDto } from './dto/relations.dto';
import { RelationsService } from './relations.service';

/**
 * Relations — the edges of the graph.
 *
 * Only create and delete: a link is a fact about two people, not a record
 * with fields to edit, and pretending otherwise would give clients a way to
 * move an edge between people one attribute at a time. Change a relation by
 * deleting it and drawing the right one.
 *
 * `FRIEND` is accepted here and never drawn by the canvas (FR-5.4) — the
 * data is recorded because the family knows it, even though a family tree
 * has no line for it.
 *
 * **Roles here.** Reading is VIEWER; drawing or removing an edge is
 * CONTRIBUTOR or OWNER. There is no ownership check on a relation because
 * there is no `createdById` to make one from (docs/design.md §2.3) — a role
 * is all the specification gives us, and it is enough: an edge names two
 * people either member can already see.
 */
@ApiTags('relations')
@Controller('trees/:treeId/relations')
export class RelationsController {
  constructor(private readonly relations: RelationsService) {}

  @Get()
  @UseGuards(TreeRoleGuard)
  @RequireRole('VIEWER')
  @ApiOperation({
    summary: 'List every relation in a tree',
    description:
      'PARENT edges read `from` is the parent of `to`; the rest are undirected pairs.',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiOkResponse({ type: [RelationDto] })
  @ApiNotFoundResponse(NOT_FOUND)
  list(@Param('treeId') treeId: string): Promise<RelationDto[]> {
    return this.relations.list(treeId);
  }

  @Post()
  @UseGuards(TreeRoleGuard)
  @RequireRole('CONTRIBUTOR')
  @ApiOperation({
    summary: 'Link two people',
    description:
      'CONTRIBUTOR or OWNER. Rejects a person linked to themselves (400), a link to somebody outside this tree (404), a parent link that would make somebody their own ancestor (400) and the same link twice (409).',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiCreatedResponse({ type: RelationDto })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiConflictResponse(CONFLICT)
  @ApiForbiddenResponse(FORBIDDEN)
  create(
    @Param('treeId') treeId: string,
    @Body() dto: CreateRelationDto,
  ): Promise<RelationDto> {
    return this.relations.create(treeId, dto);
  }

  @Delete(':relationId')
  @UseGuards(TreeRoleGuard)
  @RequireRole('CONTRIBUTOR')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove a relation',
    description:
      'CONTRIBUTOR or OWNER (FR-5.5). The two people stay in the tree; only the link goes.',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiParam({ name: 'relationId', example: 'r01' })
  @ApiNoContentResponse({ description: 'Deleted. Nothing in the body.' })
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiForbiddenResponse(FORBIDDEN)
  remove(
    @Param('treeId') treeId: string,
    @Param('relationId') relationId: string,
  ): Promise<void> {
    return this.relations.remove(treeId, relationId);
  }
}
