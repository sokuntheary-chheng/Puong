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
  Query,
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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Role } from '@prisma/client';
import {
  BAD_REQUEST,
  CONFLICT,
  FORBIDDEN,
  NOT_FOUND,
} from '../common/api-responses';
import type { Actor } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  CurrentTreeRole,
  RequireRole,
  TreeRoleGuard,
} from '../auth/tree-role.guard';
import {
  CreateMemoryDto,
  MemoryDto,
  UpdateMemoryDto,
} from './dto/memories.dto';
import { MemoriesService } from './memories.service';

/**
 * Memories — the "what only this relative knows" half of the archive (story 6).
 *
 * Listed newest-first with undated memories last (FR-6.7), and filtered by
 * FR-6.6 before the response is built: a `PRIVATE` memory never leaves the
 * service for anyone but its author.
 *
 * **Who is asking** is the session, read by `@CurrentUser()` — M2 took it as
 * `?viewerId=`, which meant the rule was only as strong as the client's
 * honesty: `?viewerId=u1` would have shown anybody the owner's private
 * memories. There is no such parameter now, so there is nothing to claim.
 *
 * **Roles here.** Reading is VIEWER (with FR-6.6 applied on top). Writing is
 * CONTRIBUTOR, plus the ownership rules of docs/design.md §2.2 in the
 * service: edit only your own, delete your own, delete somebody else's
 * shared memory only as OWNER, and never touch a private one at all.
 */
@ApiTags('memories')
@Controller('trees/:treeId/memories')
export class MemoriesController {
  constructor(private readonly memories: MemoriesService) {}

  @Get()
  @UseGuards(TreeRoleGuard)
  @RequireRole('VIEWER')
  @ApiOperation({
    summary: 'List a tree’s or one person’s memories',
    description:
      'FR-6.7 — newest occurred date first, undated last. FR-6.6 — the signed-in account sees its own `PRIVATE` memories and nobody else’s; there is no `viewerId` to pass, because the caller is the session.',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiQuery({
    name: 'personId',
    required: false,
    example: 'p09',
    description: 'Narrow to one person.',
  })
  @ApiOkResponse({ type: [MemoryDto] })
  @ApiNotFoundResponse(NOT_FOUND)
  list(
    @Param('treeId') treeId: string,
    @CurrentUser() actor: Actor,
    @Query('personId') personId?: string,
  ): Promise<MemoryDto[]> {
    return this.memories.list(treeId, { personId, viewerId: actor.id });
  }

  @Get(':memoryId')
  @UseGuards(TreeRoleGuard)
  @RequireRole('VIEWER')
  @ApiOperation({
    summary: 'Read one memory',
    description:
      'A `PRIVATE` memory that is not yours answers 404, exactly as the list hides it — otherwise the id would be a way around FR-6.6.',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiParam({ name: 'memoryId', example: 'mm1' })
  @ApiOkResponse({ type: MemoryDto })
  @ApiNotFoundResponse(NOT_FOUND)
  get(
    @Param('treeId') treeId: string,
    @Param('memoryId') memoryId: string,
    @CurrentUser() actor: Actor,
  ): Promise<MemoryDto> {
    return this.memories.get(treeId, memoryId, actor.id);
  }

  @Post()
  @UseGuards(TreeRoleGuard)
  @RequireRole('CONTRIBUTOR')
  @ApiOperation({
    summary: 'Attach a memory to a person',
    description:
      'Title and body are required (FR-6.1); the date is optional but must be a real day. The person must belong to this tree, and `authorId` is the signed-in account — a client cannot write a story under somebody else’s name.',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiCreatedResponse({ type: MemoryDto })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiConflictResponse(CONFLICT)
  @ApiForbiddenResponse(FORBIDDEN)
  create(
    @Param('treeId') treeId: string,
    @Body() dto: CreateMemoryDto,
    @CurrentUser() actor: Actor,
  ): Promise<MemoryDto> {
    return this.memories.create(treeId, dto, actor.id);
  }

  @Patch(':memoryId')
  @UseGuards(TreeRoleGuard)
  @RequireRole('CONTRIBUTOR')
  @ApiOperation({
    summary: 'Edit your memory',
    description:
      'Retitle, redating, re-photographing or changing visibility — **the author only**. Nobody edits another person’s words, not even the owner (docs/design.md §2.2); who wrote it and who it is about are facts about the row and cannot be edited.',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiParam({ name: 'memoryId', example: 'mm1' })
  @ApiOkResponse({ type: MemoryDto })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiForbiddenResponse(FORBIDDEN)
  update(
    @Param('treeId') treeId: string,
    @Param('memoryId') memoryId: string,
    @Body() dto: UpdateMemoryDto,
    @CurrentUser() actor: Actor,
  ): Promise<MemoryDto> {
    return this.memories.update(treeId, memoryId, dto, actor.id);
  }

  @Delete(':memoryId')
  @UseGuards(TreeRoleGuard)
  @RequireRole('CONTRIBUTOR')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a memory',
    description:
      'Your own memory (FR-6.4); somebody else’s **shared** one only as OWNER (FR-6.8); a **private** one only its author, owner included (FR-6.6) — it answers 404 to anyone else, because you cannot delete what you may not see.',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiParam({ name: 'memoryId', example: 'mm1' })
  @ApiNoContentResponse({ description: 'Deleted. Nothing in the body.' })
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiForbiddenResponse(FORBIDDEN)
  remove(
    @Param('treeId') treeId: string,
    @Param('memoryId') memoryId: string,
    @CurrentUser() actor: Actor,
    @CurrentTreeRole() role: Role,
  ): Promise<void> {
    return this.memories.remove(treeId, memoryId, actor.id, role);
  }
}
