import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { BAD_REQUEST, CONFLICT, NOT_FOUND } from '../common/api-responses';
import { CreateUserDto, UpdateUserDto, UserDto } from './dto/users.dto';
import { UsersService } from './users.service';

/**
 * Accounts. Read and write only — there is deliberately no `DELETE /users/:id`:
 * a person and a memory outlive the account that wrote them, so removing an
 * account would have to decide what happens to the family record it created.
 * That decision belongs with the ownership rules of M3, not to a CRUD
 * reflex here.
 */
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'List every account',
    description:
      'Used for the "who wrote this" line on a memory and for choosing a member to invite.',
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
    summary: 'Create an account',
    description:
      'The password is hashed with bcrypt (cost 10) and never returned. A login flow with a token is M3.',
  })
  @ApiCreatedResponse({ type: UserDto })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiConflictResponse(CONFLICT)
  create(@Body() dto: CreateUserDto): Promise<UserDto> {
    return this.users.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change an account’s email, name or password' })
  @ApiOkResponse({ type: UserDto })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiConflictResponse(CONFLICT)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserDto> {
    return this.users.update(id, dto);
  }
}
