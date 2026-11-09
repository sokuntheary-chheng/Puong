import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { CookieOptions } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import type { CreateUserDto, UserDto } from '../users/dto/users.dto';
import type { SessionPayload } from './auth.guard';
import type { LoginDto } from './dto/auth.dto';
import { LoginThrottle } from './login-throttle.service';

/** How long the browser keeps the cookie, and how long the signature verifies. */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A bcrypt digest of the literal word `password` at cost 10.
 *
 * Used as the comparison target when the email does not exist, so that
 * "unknown account" and "wrong password" cost the same amount of CPU and
 * the same number of milliseconds — timing is not a second oracle sitting
 * next to the error message. The comparison can never succeed: no account
 * is allowed to hold this value.
 */
const DUMMY_DIGEST =
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

/**
 * Registration, login, and the session they produce.
 *
 * Passwords never enter this file as anything but a comparison: creating an
 * account is `UsersService.create`, which hashes, and signing in is one
 * `bcrypt.compare` against the stored digest.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly throttle: LoginThrottle,
  ) {}

  /** Creates the account (hashed, by `UsersService`) for the register flow. */
  register(dto: CreateUserDto): Promise<UserDto> {
    return this.users.create(dto);
  }

  /**
   * Verifies an email and password and returns the account to sign in.
   *
   * One message covers both failure cases — "Email or password is
   * incorrect" — because a form that distinguishes "no such account" from
   * "wrong password" is a free account-existence oracle, and this API holds
   * family names and addresses that are worth not enumerating.
   *
   * `address` is the caller's, for `LoginThrottle`: the limit is checked
   * before the password is compared and recorded after a miss, so the count
   * is of guesses rather than of requests.
   */
  async login(dto: LoginDto, address: string): Promise<UserDto> {
    this.throttle.assertAllowed(address);

    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });

    const ok = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? DUMMY_DIGEST,
    );
    if (user === null || !ok) {
      this.throttle.recordFailure(address);
      throw new UnauthorizedException('Email or password is incorrect.');
    }

    return this.users.get(user.id);
  }

  /** The account behind the cookie, read fresh rather than trusted from the token. */
  me(userId: string): Promise<UserDto> {
    return this.users.get(userId);
  }

  /**
   * The server half of signing out: stamp the moment, and every token issued
   * at or before it stops being honoured by `AuthGuard`.
   *
   * `updateMany` rather than `update` because this runs from a `@Public()`
   * route — logging out twice, or with a cookie for an account that has since
   * gone, must stay a 204 rather than becoming a 404 in somebody's face on
   * their way out.
   */
  async revokeSession(userId: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId },
      data: { sessionRevokedAt: new Date() },
    });
  }

  /**
   * Signs the session. `sub` is the one field every guard reads.
   *
   * `iatMs` is added here rather than left to the library: the library writes
   * `iat` in whole seconds, and `AuthGuard` has to tell a token issued *after*
   * a sign-out apart from one issued *before* it inside the same second.
   */
  issueToken(user: {
    id: string;
    email: string;
    displayName: string;
  }): Promise<string> {
    const payload: SessionPayload = {
      sub: user.id,
      email: user.email,
      name: user.displayName,
      iatMs: Date.now(),
    };
    return this.jwt.signAsync(payload, { expiresIn: SESSION_TTL_MS / 1000 });
  }

  /**
   * The cookie the browser is given.
   *
   * - `httpOnly` — script cannot read it, so script injected into the page
   *   cannot take the session with it. This is the answer to M3's explain
   *   question, and the reason login answers with the account rather than a
   *   token.
   * - `sameSite: 'strict'` — the browser will not attach this cookie to a
   *   request that another site caused, which is most of CSRF refused before
   *   the server sees anything. The `Origin` check in `AuthGuard` is the
   *   second lock on the same door.
   * - `secure` — from the environment, because a `Secure` cookie is dropped
   *   by the browser over plain `http`, and this stack is served over http
   *   on `localhost` in development. It must be `true` behind TLS.
   * - `maxAge` — seven days, and the JWT expires with it: a cookie that
   *   outlives its signature would just fail verification on every request.
   */
  cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.config.get<string>('COOKIE_SECURE') === 'true',
      path: '/',
      maxAge: SESSION_TTL_MS,
    };
  }
}
