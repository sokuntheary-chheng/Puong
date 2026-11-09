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
import { CreatePersonDto, PersonDto, UpdatePersonDto } from './dto/people.dto';
import { PeopleService } from './people.service';

/**
 * People — the family members themselves.
 *
 * Addressed through their tree (`/trees/:treeId/people`) because a person is
 * only meaningful inside one family, and because M3's ownership checks are
 * per tree: the tree id is already in the path, so every handler has the
 * scope it will need to authorise against.
 *
 * **Roles here (docs/design.md §2.1).** Reading is VIEWER; adding is
 * CONTRIBUTOR; editing or deleting is CONTRIBUTOR **and** the person must be
 * one you created — an OWNER may edit anybody's (FR-4.4), which is the
 * ownership half the role guard cannot see and the service checks against
 * the loaded row.
 */
@ApiTags('people')
@Controller('trees/:treeId/people')
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get()
  @UseGuards(TreeRoleGuard)
  @RequireRole('VIEWER')
  @ApiOperation({
    summary: 'List every person in a tree',
    description:
      'Members only — a non-member gets 404 rather than a family they cannot see (FR-2.5).',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiOkResponse({ type: [PersonDto] })
  @ApiNotFoundResponse(NOT_FOUND)
  list(@Param('treeId') treeId: string): Promise<PersonDto[]> {
    return this.people.list(treeId);
  }

  @Get(':personId')
  @UseGuards(TreeRoleGuard)
  @RequireRole('VIEWER')
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
  @UseGuards(TreeRoleGuard)
  @RequireRole('CONTRIBUTOR')
  @ApiOperation({
    summary: 'Add a person to a tree',
    description:
      'FR-4.1 — `fullName` is required; everything else may be filled in later, which is how a family actually records its older members. CONTRIBUTOR or OWNER; the creator is read from the session, not from the body.',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiCreatedResponse({ type: PersonDto })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiConflictResponse(CONFLICT)
  @ApiForbiddenResponse(FORBIDDEN)
  create(
    @Param('treeId') treeId: string,
    @Body() dto: CreatePersonDto,
    @CurrentUser() actor: Actor,
  ): Promise<PersonDto> {
    return this.people.create(treeId, dto, actor.id);
  }

  @Patch(':personId')
  @UseGuards(TreeRoleGuard)
  @RequireRole('CONTRIBUTOR')
  @ApiOperation({
    summary: 'Edit a person’s profile',
    description:
      'CONTRIBUTOR for a person you created, OWNER for any person in the tree (FR-4.4). A contributor editing somebody else’s record is 403.',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiParam({ name: 'personId', example: 'p09' })
  @ApiOkResponse({ type: PersonDto })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiForbiddenResponse(FORBIDDEN)
  update(
    @Param('treeId') treeId: string,
    @Param('personId') personId: string,
    @Body() dto: UpdatePersonDto,
    @CurrentUser() actor: Actor,
    @CurrentTreeRole() role: Role,
  ): Promise<PersonDto> {
    return this.people.update(treeId, personId, dto, actor.id, role);
  }

  @Delete(':personId')
  @UseGuards(TreeRoleGuard)
  @RequireRole('CONTRIBUTOR')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a person',
    description:
      'Same rule as editing — yours to delete if you created it, anybody’s if you are the OWNER. Their relations and memories go with them: the graph must never draw an edge to somebody who is gone.',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiParam({ name: 'personId', example: 'p09' })
  @ApiNoContentResponse({ description: 'Deleted. Nothing in the body.' })
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiForbiddenResponse(FORBIDDEN)
  remove(
    @Param('treeId') treeId: string,
    @Param('personId') personId: string,
    @CurrentUser() actor: Actor,
    @CurrentTreeRole() role: Role,
  ): Promise<void> {
    return this.people.remove(treeId, personId, actor.id, role);
  }
}
