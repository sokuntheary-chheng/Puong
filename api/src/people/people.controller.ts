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
  ApiTags,
} from '@nestjs/swagger';
import { BAD_REQUEST, CONFLICT, NOT_FOUND } from '../common/api-responses';
import { CreatePersonDto, PersonDto, UpdatePersonDto } from './dto/people.dto';
import { PeopleService } from './people.service';

/**
 * People — the family members themselves.
 *
 * Addressed through their tree (`/trees/:treeId/people`) because a person is
 * only meaningful inside one family, and because M3's ownership checks are
 * per tree: the tree id is already in the path, so every handler has the
 * scope it will need to authorise against.
 */
@ApiTags('people')
@Controller('trees/:treeId/people')
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get()
  @ApiOperation({ summary: 'List every person in a tree' })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiOkResponse({ type: [PersonDto] })
  @ApiNotFoundResponse(NOT_FOUND)
  list(@Param('treeId') treeId: string): Promise<PersonDto[]> {
    return this.people.list(treeId);
  }

  @Get(':personId')
  @ApiOperation({ summary: 'Read one person' })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiParam({ name: 'personId', example: 'p09' })
  @ApiOkResponse({ type: PersonDto })
  @ApiNotFoundResponse(NOT_FOUND)
  get(
    @Param('treeId') treeId: string,
    @Param('personId') personId: string,
  ): Promise<PersonDto> {
    return this.people.get(treeId, personId);
  }

  @Post()
  @ApiOperation({
    summary: 'Add a person to a tree',
    description:
      'FR-4.1 — `fullName` is required; everything else may be filled in later, which is how a family actually records its older members.',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiCreatedResponse({ type: PersonDto })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiConflictResponse(CONFLICT)
  create(
    @Param('treeId') treeId: string,
    @Body() dto: CreatePersonDto,
  ): Promise<PersonDto> {
    return this.people.create(treeId, dto);
  }

  @Patch(':personId')
  @ApiOperation({ summary: 'Edit a person’s profile' })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiParam({ name: 'personId', example: 'p09' })
  @ApiOkResponse({ type: PersonDto })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiNotFoundResponse(NOT_FOUND)
  update(
    @Param('treeId') treeId: string,
    @Param('personId') personId: string,
    @Body() dto: UpdatePersonDto,
  ): Promise<PersonDto> {
    return this.people.update(treeId, personId, dto);
  }

  @Delete(':personId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a person',
    description:
      'Their relations and memories go with them — the graph must never draw an edge to somebody who is gone.',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiParam({ name: 'personId', example: 'p09' })
  @ApiNoContentResponse({ description: 'Deleted. Nothing in the body.' })
  @ApiNotFoundResponse(NOT_FOUND)
  remove(
    @Param('treeId') treeId: string,
    @Param('personId') personId: string,
  ): Promise<void> {
    return this.people.remove(treeId, personId);
  }
}
