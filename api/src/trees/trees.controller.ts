import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { BAD_REQUEST, FORBIDDEN, NOT_FOUND } from '../common/api-responses';
import type { Actor } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequireRole, TreeRoleGuard } from '../auth/tree-role.guard';
import { CreateTreeDto, TreeDto, UpdateTreeDto } from './dto/trees.dto';
import { TreesService } from './trees.service';

/**
 * Trees — the container everything else hangs off.
 *
 * Every other resource in this API is addressed *through* a tree
 * (`/trees/:treeId/people`, `/trees/:treeId/memories`, …) rather than through
 * a flat id, because a person, a relation and a memory are only meaningful
 * inside one family: an id alone would let a client reach across trees, and
 * the ownership checks of M3 are per tree.
 *
 * **Roles here.** Reading and listing need an ACTIVE membership — a stranger
 * gets 404, not 403 (FR-2.5). Editing or deleting needs OWNER. Creating
 * needs nothing but a session, and makes the caller the owner (FR-2.1).
 */
@ApiTags('trees')
@Controller('trees')
export class TreesController {
  constructor(private readonly trees: TreesService) {}

  @Get()
  @ApiOperation({
    summary: 'List my trees',
    description:
      'Only the trees the **signed-in account** is an ACTIVE member of — an accepted invitation is what puts a tree in somebody’s list (FR-1.2, FR-3.5). The caller is read from the session; there is no `memberId` to claim.',
  })
  @ApiOkResponse({ type: [TreeDto] })
  list(@CurrentUser() actor: Actor): Promise<TreeDto[]> {
    return this.trees.list(actor.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a tree',
    description:
      'Creates the tree and an ACTIVE OWNER membership for the signed-in account, in one transaction. Any account may do this (FR-2.1).',
  })
  @ApiCreatedResponse({ type: TreeDto })
  @ApiBadRequestResponse(BAD_REQUEST)
  create(
    @Body() dto: CreateTreeDto,
    @CurrentUser() actor: Actor,
  ): Promise<TreeDto> {
    return this.trees.create(dto, actor.id);
  }

  @Get(':id')
  @UseGuards(TreeRoleGuard)
  @RequireRole('VIEWER', 'id')
  @ApiOperation({
    summary: 'Read one tree',
    description:
      'Membership required — a tree you are not a member of answers 404 (FR-2.5).',
  })
  @ApiParam({ name: 'id', example: 't1' })
  @ApiOkResponse({ type: TreeDto })
  @ApiNotFoundResponse(NOT_FOUND)
  get(@Param('id') id: string): Promise<TreeDto> {
    return this.trees.get(id);
  }

  @Patch(':id')
  @UseGuards(TreeRoleGuard)
  @RequireRole('OWNER', 'id')
  @ApiOperation({
    summary: 'Rename a tree, edit its description or nominate a successor',
    description: 'OWNER only (docs/design.md §2.1).',
  })
  @ApiParam({ name: 'id', example: 't1' })
  @ApiOkResponse({ type: TreeDto })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiForbiddenResponse(FORBIDDEN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTreeDto,
  ): Promise<TreeDto> {
    return this.trees.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(TreeRoleGuard)
  @RequireRole('OWNER', 'id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a tree',
    description:
      'OWNER only. Its memberships, people, relations and memories go with it — the whole branch is one cascade, not a list of deletes to forget.',
  })
  @ApiParam({ name: 'id', example: 't1' })
  @ApiNoContentResponse({ description: 'Deleted. Nothing in the body.' })
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiForbiddenResponse(FORBIDDEN)
  remove(@Param('id') id: string): Promise<void> {
    return this.trees.remove(id);
  }
}
