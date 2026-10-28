import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
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
import { CreateUserDto, UpdateUserDto, UserDto } from './dto/users.dto';
import { UsersService } from './users.service';

/**
 * Accounts. Read and write only — there is deliberately no `DELETE /users/:id`:
 * a person and a memory outlive the account that wrote them, so removing an
 * account would have to decide what happens to the family record it created.
 *
 * **Who may call:** any signed-in account (the global `AuthGuard` runs first).
 * Writing is narrower still — `PATCH /users/:id` is **you**, because an
 * account that can change somebody else's password can take their session
 * and their memories with it. Registration is not here: it is
 * `POST /auth/register`, which also issues the session.
 */
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'List every account',
    description:
      'Used for the "who wrote this" line on a memory and for choosing a member to invite. Requires a session; `passwordHash` is never in the response.',
  })
  @ApiOkResponse({ type: [UserDto] })
  list(): Promise<UserDto[]> {
    return this.users.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read one account' })
  @ApiOkResponse({ type: UserDto })
  @ApiNotFoundResponse(NOT_FOUND)
  get(@Param('id') id: string): Promise<UserDto> {
    return this.users.get(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create an account on somebody’s behalf',
    description:
      'For adding a relative who has no account yet. The password is hashed with bcrypt (cost 10) and never returned. Self-service registration — which is what issues a session — is `POST /auth/register`.',
  })
  @ApiCreatedResponse({ type: UserDto })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiConflictResponse(CONFLICT)
  create(@Body() dto: CreateUserDto): Promise<UserDto> {
    return this.users.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Change your own email, name or password',
    description:
      'You may change only your own account: `403` on anybody else’s.',
  })
  @ApiOkResponse({ type: UserDto })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiConflictResponse(CONFLICT)
  @ApiForbiddenResponse(FORBIDDEN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: Actor,
  ): Promise<UserDto> {
    return this.users.update(id, dto, actor.id);
  }
}
