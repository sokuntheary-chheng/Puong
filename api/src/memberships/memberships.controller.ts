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
import {
  BAD_REQUEST,
  CONFLICT,
  FORBIDDEN,
  NOT_FOUND,
} from '../common/api-responses';
import type { Actor } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequireRole, TreeRoleGuard } from '../auth/tree-role.guard';
import {
  CreateMembershipDto,
  InvitationDto,
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
 *
 * **Roles here.** Reading the member list needs VIEWER (you are a member);
 * inviting or admitting needs OWNER. `/memberships/:id` names no tree, so
 * the OWNER check is made in the service against the tree *of that row* —
 * the one tree a route parameter cannot tell you. The exception is your own
 * row: accepting or declining an invitation is the one membership change a
 * non-owner makes (FR-3.5), and only their own.
 */
@ApiTags('memberships')
@Controller()
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get('memberships/mine')
  @ApiOperation({
    summary: 'My pending invitations (FR-3.2)',
    description:
      'The banner on the invited account’s home page: every `INVITED` membership of **my** account whose seven days have not run out (FR-3.4), each with the tree it opens and the day it expires. Expired invitations are absent rather than listed — they cannot be accepted, so offering them would be an offer the API refuses.',
  })
  @ApiOkResponse({ type: [InvitationDto] })
  mine(@CurrentUser() actor: Actor): Promise<InvitationDto[]> {
    return this.memberships.mine(actor.id);
  }

  @Get('trees/:treeId/members')
  @UseGuards(TreeRoleGuard)
  @RequireRole('VIEWER')
  @ApiOperation({
    summary: 'List a tree’s members, including pending invitations',
    description: 'Members only — a non-member gets 404.',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiOkResponse({ type: [MembershipDto] })
  @ApiNotFoundResponse(NOT_FOUND)
  list(@Param('treeId') treeId: string): Promise<MembershipDto[]> {
    return this.memberships.list(treeId);
  }

  @Get('trees/:treeId/members/:userId')
  @UseGuards(TreeRoleGuard)
  @RequireRole('VIEWER')
  @ApiOperation({
    summary: 'Read one account’s membership in one tree',
    description:
      'The endpoint behind "you are owner here" and behind the UI deciding which controls to draw. 404 means *not a member of this tree* (so, not a member either); a returned row may still be `INVITED` or `REVOKED`, which the caller must read.',
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
  @UseGuards(TreeRoleGuard)
  @RequireRole('OWNER')
  @ApiOperation({
    summary: 'Invite an account to a tree, or admit it outright',
    description:
      'OWNER only (FR-3.1). Defaults to `INVITED`; send `status: "ACTIVE"` to admit without waiting for an acceptance.',
  })
  @ApiParam({ name: 'treeId', example: 't1' })
  @ApiCreatedResponse({ type: MembershipDto })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiConflictResponse(CONFLICT)
  @ApiForbiddenResponse(FORBIDDEN)
  create(
    @Param('treeId') treeId: string,
    @Body() dto: CreateMembershipDto,
  ): Promise<MembershipDto> {
    return this.memberships.create(treeId, dto);
  }

  @Patch('memberships/:id')
  @ApiOperation({
    summary: 'Change a member’s role, or accept / revoke their membership',
    description:
      'OWNER of that tree, except for one case: you may change the **status of your own row** — accepting or declining an invitation (FR-3.5) — and nothing else on it.',
  })
  @ApiParam({ name: 'id', example: 'mb3' })
  @ApiOkResponse({ type: MembershipDto })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiForbiddenResponse(FORBIDDEN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMembershipDto,
    @CurrentUser() actor: Actor,
  ): Promise<MembershipDto> {
    return this.memberships.update(id, dto, actor.id);
  }

  @Delete('memberships/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove a member or decline an invitation',
    description:
      'OWNER of that tree, or you removing yourself (which is how an invitation is declined).',
  })
  @ApiParam({ name: 'id', example: 'mb3' })
  @ApiNoContentResponse({ description: 'Deleted. Nothing in the body.' })
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiForbiddenResponse(FORBIDDEN)
  remove(@Param('id') id: string, @CurrentUser() actor: Actor): Promise<void> {
    return this.memberships.remove(id, actor.id);
  }
}
