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
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { BAD_REQUEST, NOT_FOUND } from '../common/api-responses';
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
 */
@ApiTags('trees')
@Controller('trees')
export class TreesController {
  constructor(private readonly trees: TreesService) {}

  @Get()
  @ApiOperation({
    summary: 'List trees',
    description:
      'With `memberId`, only the trees that account is an ACTIVE member of — an accepted invitation is what puts a tree in somebody’s list (FR-1.2, FR-3.5). Without it, every tree.',
  })
  @ApiQuery({
    name: 'memberId',
    required: false,
    example: 'u1',
    description: 'Restrict to the trees this account belongs to.',
  })
  @ApiOkResponse({ type: [TreeDto] })
  list(@Query('memberId') memberId?: string): Promise<TreeDto[]> {
    return this.trees.list(memberId);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a tree',
    description:
      'Creates the tree and an ACTIVE OWNER membership for `ownerId` in one transaction.',
  })
  @ApiCreatedResponse({ type: TreeDto })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiNotFoundResponse(NOT_FOUND)
  create(@Body() dto: CreateTreeDto): Promise<TreeDto> {
    return this.trees.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read one tree' })
  @ApiParam({ name: 'id', example: 't1' })
  @ApiOkResponse({ type: TreeDto })
  @ApiNotFoundResponse(NOT_FOUND)
  get(@Param('id') id: string): Promise<TreeDto> {
    return this.trees.get(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Rename a tree, edit its description or nominate a successor',
  })
  @ApiParam({ name: 'id', example: 't1' })
  @ApiOkResponse({ type: TreeDto })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiNotFoundResponse(NOT_FOUND)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTreeDto,
  ): Promise<TreeDto> {
    return this.trees.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a tree',
    description:
      'Its memberships, people, relations and memories go with it — the whole branch is one cascade, not a list of deletes to forget.',
  })
  @ApiParam({ name: 'id', example: 't1' })
  @ApiNoContentResponse({ description: 'Deleted. Nothing in the body.' })
  @ApiNotFoundResponse(NOT_FOUND)
  remove(@Param('id') id: string): Promise<void> {
    return this.trees.remove(id);
  }
}
