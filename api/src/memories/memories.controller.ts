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
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { BAD_REQUEST, CONFLICT, NOT_FOUND } from '../common/api-responses';
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
 */
@ApiTags('memories')
@Controller('trees/:treeId/memories')
export class MemoriesController {
  constructor(private readonly memories: MemoriesService) {}

  @Get()
  @ApiOperation({
    summary: 'List a tree’s or one person’s memories',
    description:
      'FR-6.7 — newest occurred date first, undated last. FR-6.6 — `viewerId` sees only its own `PRIVATE` memories; omit it to list every memory in the tree (which is what an owner-facing report needs, and what M3 will replace with the session).',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiQuery({
    name: 'personId',
    required: false,
    example: 'p09',
    description: 'Narrow to one person.',
  })
  @ApiQuery({
    name: 'viewerId',
    required: false,
    example: 'u2',
    description: 'Who is asking, so FR-6.6 can be applied.',
  })
  @ApiOkResponse({ type: [MemoryDto] })
  @ApiNotFoundResponse(NOT_FOUND)
  list(
    @Param('treeId') treeId: string,
    @Query('personId') personId?: string,
    @Query('viewerId') viewerId?: string,
  ): Promise<MemoryDto[]> {
    return this.memories.list(treeId, { personId, viewerId });
  }

  @Get(':memoryId')
  @ApiOperation({ summary: 'Read one memory' })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiParam({ name: 'memoryId', example: 'mm1' })
  @ApiQuery({ name: 'viewerId', required: false, example: 'u2' })
  @ApiOkResponse({ type: MemoryDto })
  @ApiNotFoundResponse(NOT_FOUND)
  get(
    @Param('treeId') treeId: string,
    @Param('memoryId') memoryId: string,
    @Query('viewerId') viewerId?: string,
  ): Promise<MemoryDto> {
    return this.memories.get(treeId, memoryId, viewerId);
  }

  @Post()
  @ApiOperation({
    summary: 'Attach a memory to a person',
    description:
      'Title and body are required (FR-6.1); the date is optional but must be a real day. The person must belong to this tree.',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiCreatedResponse({ type: MemoryDto })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiConflictResponse(CONFLICT)
  create(
    @Param('treeId') treeId: string,
    @Body() dto: CreateMemoryDto,
  ): Promise<MemoryDto> {
    return this.memories.create(treeId, dto);
  }

  @Patch(':memoryId')
  @ApiOperation({
    summary: 'Edit a memory',
    description:
      'Retitle, redating, re-photographing or changing visibility. Who wrote it and who it is about are facts about the row and cannot be edited.',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiParam({ name: 'memoryId', example: 'mm1' })
  @ApiOkResponse({ type: MemoryDto })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiNotFoundResponse(NOT_FOUND)
  update(
    @Param('treeId') treeId: string,
    @Param('memoryId') memoryId: string,
    @Body() dto: UpdateMemoryDto,
  ): Promise<MemoryDto> {
    return this.memories.update(treeId, memoryId, dto);
  }

  @Delete(':memoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a memory' })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiParam({ name: 'memoryId', example: 'mm1' })
  @ApiNoContentResponse({ description: 'Deleted. Nothing in the body.' })
  @ApiNotFoundResponse(NOT_FOUND)
  remove(
    @Param('treeId') treeId: string,
    @Param('memoryId') memoryId: string,
  ): Promise<void> {
    return this.memories.remove(treeId, memoryId);
  }
}
