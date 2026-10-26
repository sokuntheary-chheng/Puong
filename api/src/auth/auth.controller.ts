import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { BAD_REQUEST, CONFLICT } from '../common/api-responses';
import { CreateUserDto, UserDto } from '../users/dto/users.dto';
import { AuthService } from './auth.service';
import { SESSION_COOKIE, type Actor } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { Public } from './public.decorator';
import { LoginDto, SessionDto } from './dto/auth.dto';

/**
 * The session: how you get one, and how you lose it.
 *
 * The controller owns the cookie — signing, setting and clearing it — while
 * the service owns the password. That split is deliberate: a service that
 * can write to the response could set an unauthenticated session anywhere,
 * and a controller that compared passwords could forget to hash one.
 *
 * Nothing here returns a token in the body. The browser is handed a value
 * it cannot read (`httpOnly`), and the account is what the SPA keeps.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Create an account and sign in as it',
    description:
      'Registration plus a session in one step: the account is created with a bcrypt hash (cost 10) and the session is set as an `httpOnly`, `SameSite=Strict` cookie. Nothing in the body is a token.',
  })
  @ApiCreatedResponse({ type: SessionDto })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiConflictResponse(CONFLICT)
  async register(
    @Body() dto: CreateUserDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionDto> {
    const user = await this.auth.register(dto);
    await this.setSession(response, user);
    return { user };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in',
    description:
      'Answers 201-free 200 with the account and sets the session cookie. A wrong email and a wrong password are the same 401 with the same message.',
  })
  @ApiOkResponse({ type: SessionDto })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionDto> {
    const user = await this.auth.login(dto);
    await this.setSession(response, user);
    return { user };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Sign out',
    description:
      'Clears the session cookie. Public and idempotent: logging out twice, or without a session, is still a 204.',
  })
  @ApiNoContentResponse({
    description: 'The cookie is gone. Nothing in the body.',
  })
  logout(@Res({ passthrough: true }) response: Response): void {
    response.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  @ApiOperation({
    summary: 'Who is signed in',
    description:
      'Read from the cookie, and re-read from the database rather than trusted from the token, so a renamed or removed account is reflected immediately.',
  })
  @ApiOkResponse({ type: UserDto })
  me(@CurrentUser() actor: Actor): Promise<UserDto> {
    return this.auth.me(actor.id);
  }

  private async setSession(response: Response, user: UserDto): Promise<void> {
    const token = await this.auth.issueToken(user);
    response.cookie(SESSION_COOKIE, token, this.auth.cookieOptions());
  }
}
