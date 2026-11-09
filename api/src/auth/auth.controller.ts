import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
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
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  BAD_REQUEST,
  CONFLICT,
  TOO_MANY_REQUESTS,
} from '../common/api-responses';
import { CreateUserDto, UserDto } from '../users/dto/users.dto';
import { AuthService } from './auth.service';
import { SESSION_COOKIE, type Actor } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { Public } from './public.decorator';
import { LoginDto, SessionDto } from './dto/auth.dto';

/**
 * Rate limits on the two endpoints that create a session, and why they are
 * not the same mechanism:
 *
 * - **register** counts every request: ten a minute from one address, via
 *   `@Throttle` on the route. Nobody legitimately creates accounts faster
 *   than that, so there is nothing to spare and the library's counter is the
 *   whole answer.
 * - **login** counts only the attempts that *failed* — see
 *   `LoginThrottle`. A request that signs in successfully is not an attack,
 *   and a limit that charged for it would also charge the member signing in
 *   on their second device, or the verification script signing in as the
 *   whole demo family.
 *
 * Both arrive as `429` in the standard error body, and both key on the
 * caller's address — which is the client's, not nginx's, only while
 * `TRUST_PROXY` is on (see `main.ts`).
 */
const REGISTER_ATTEMPTS_PER_MINUTE = 10;

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
  @Throttle({
    default: { limit: REGISTER_ATTEMPTS_PER_MINUTE, ttl: 60_000 },
  })
  @Post('register')
  @ApiOperation({
    summary: 'Create an account and sign in as it',
    description:
      'Registration plus a session in one step: the account is created with a bcrypt hash (cost 10) and the session is set as an `httpOnly`, `SameSite=Strict` cookie. Nothing in the body is a token.',
  })
  @ApiCreatedResponse({ type: SessionDto })
  @ApiBadRequestResponse(BAD_REQUEST)
  @ApiConflictResponse(CONFLICT)
  @ApiTooManyRequestsResponse(TOO_MANY_REQUESTS)
  async register(
    @Body() dto: CreateUserDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionDto> {
    const user = await this.auth.register(dto);
    await this.setSession(response, user);
    return { user };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({
    summary: 'Sign in',
    description:
      'Answers 200 with the account and sets the session cookie. A wrong email and a wrong password are the same 401 with the same message; ten failures in a minute turn the next attempt into a 429.',
  })
  @ApiOkResponse({ type: SessionDto })
  @ApiTooManyRequestsResponse(TOO_MANY_REQUESTS)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionDto> {
    // The address the limiter counts by. Express always fills `ip`; the
    // `??` is for the type, and shares one bucket for any request that
    // somehow arrives without one — conservative in the right direction.
    const user = await this.auth.login(dto, request.ip ?? 'unknown');
    await this.setSession(response, user);
    return { user };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Sign out',
    description:
      'Clears the session cookie **and** stamps `User.sessionRevokedAt`, so the token itself stops being honoured — a copy taken before signing out is refused from then on, not merely left un-served by this browser. Public and idempotent: logging out twice, or without a session, is still a 204.',
  })
  @ApiNoContentResponse({
    description: 'The cookie is gone. Nothing in the body.',
  })
  async logout(
    @Req() request: Request & { user?: Actor },
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    response.clearCookie(SESSION_COOKIE, { path: '/' });
    if (request.user !== undefined) {
      await this.auth.revokeSession(request.user.id);
    }
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
