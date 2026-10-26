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
import {
  CreateMembershipDto,
  MembershipDto,
  UpdateMembershipDto,
} from './dto/memberships.dto';
import { MembershipsService } from './memberships.service';

/**
 * Memberships — the join between a person and a tree, and the only place a
 * role exists.
 *
 * Two shapes of path, on purpose: a tree's members are read and written
 * *through* the tree (`/trees/:treeId/members`), while an existing membership
 * is edited on its own (`/memberships/:id`) — you already know its id if you
 * are editing it, and re-deriving it from a tree and a user would just be a
 * second way to say the same thing.
 */
@ApiTags('memberships')
@Controller()
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get('trees/:treeId/members')
  @ApiOperation({
    summary: 'List a tree’s members, including pending invitations',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiOkResponse({ type: [MembershipDto] })
  @ApiNotFoundResponse(NOT_FOUND)
  list(@Param('treeId') treeId: string): Promise<MembershipDto[]> {
    return this.memberships.list(treeId);
  }

  @Get('trees/:treeId/members/:userId')
  @ApiOperation({
    summary: 'Read one account’s membership in one tree',
    description:
      'The endpoint behind "you are owner here". 404 means *not a member at all*; a returned row may still be `INVITED` or `REVOKED`, which the caller must read.',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiParam({ name: 'userId', example: 'u3' })
  @ApiOkResponse({ type: MembershipDto })
  @ApiNotFoundResponse(NOT_FOUND)
  forUser(
    @Param('treeId') treeId: string,
    @Param('userId') userId: string,
  ): Promise<MembershipDto> {
    return this.memberships.forUser(treeId, userId);
  }

  @Post('trees/:treeId/members')
  @ApiOperation({
    summary: 'Invite an account to a tree, or admit it outright',
    description:
      'Defaults to `INVITED`; send `status: "ACTIVE"` to admit without waiting for an acceptance.',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiCreatedResponse({ type: MembershipDto })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiConflictResponse(CONFLICT)
  create(
    @Param('treeId') treeId: string,
    @Body() dto: CreateMembershipDto,
  ): Promise<MembershipDto> {
    return this.memberships.create(treeId, dto);
  }

  @Patch('memberships/:id')
  @ApiOperation({
    summary: 'Change a member’s role, or accept / revoke their membership',
  })
  @ApiParam({ name: 'id', example: 'mb3' })
  @ApiOkResponse({ type: MembershipDto })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiNotFoundResponse(NOT_FOUND)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMembershipDto,
  ): Promise<MembershipDto> {
    return this.memberships.update(id, dto);
  }

  @Delete('memberships/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member or decline an invitation' })
  @ApiParam({ name: 'id', example: 'mb3' })
  @ApiNoContentResponse({ description: 'Deleted. Nothing in the body.' })
  @ApiNotFoundResponse(NOT_FOUND)
  remove(@Param('id') id: string): Promise<void> {
    return this.memberships.remove(id);
  }
}
