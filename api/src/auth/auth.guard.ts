import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Who is calling, as every guarded handler sees it.
 *
 * `id` is the only field anything authorises on; `email` and `displayName`
 * are here so a controller does not have to re-read the account for a line
 * of text, and so nothing downstream is tempted to take an identity from
 * the request body.
 */
export interface Actor {
  id: string;
  email: string;
  displayName: string;
}

/** The signed contents of the session cookie. */
export interface SessionPayload {
  sub: string;
  email: string;
  name: string;
  /** Issued-at, in seconds — added by the JWT library. */
  iat?: number;
  /**
   * Issued-at, in milliseconds — added by `AuthService.issueToken`.
   *
   * The library's own `iat` is seconds, which is not enough to answer
   * "before the sign-out or after it?" when both happen inside one second.
   * A token without this claim falls back to `iat` (see `isRevoked`), so a
   * missing field costs precision, never safety.
   */
  iatMs?: number;
}

export const SESSION_COOKIE = 'puong_session';

/** Requests whose method can change something, for the cross-site check. */
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * The one door into the API: **authentication**, plus the cross-site check
 * that a cookie-based session needs.
 *
 * Order matters and is deliberate:
 *
 * 1. **Origin first, for every request, public or not.** A cookie is sent
 *    automatically, so the one thing a browser cannot be trusted to decide
 *    is *where* a state-changing request came from. `SameSite=Strict` already
 *    refuses cross-site cookies; comparing the `Origin` header with the host
 *    the request arrived on is the second lock on the same door, and it is
 *    checked before anything else so an attacker's request cannot reach a
 *    handler to be reasoned about. Requests without an `Origin` header
 *    (curl, Postman, the verification script) are not browser traffic and
 *    carry no ambient authority to abuse — they still need a valid cookie.
 * 2. **Then the session.** No cookie, or one that fails to verify, is a 401 —
 *    except on routes marked `@Public()` (login and register, which are how
 *    you get a cookie in the first place).
 * 3. **Then whether that session still exists.** A signature that verifies is
 *    only half of it: `logout` stamps `User.sessionRevokedAt`, and any token
 *    issued at or before that instant is refused here. Without this, signing
 *    out would only drop the cookie this browser was holding, and a copy taken
 *    earlier would keep working for the rest of its seven days.
 *
 * The token is read from an `httpOnly` cookie and never from a header the
 * page could have written, which is what stops a script injected into the
 * page from taking the session with it (see MILESTONES.md, M3 explain).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: Actor }>();
    const response = context.switchToHttp().getResponse<Response>();

    this.assertSameOrigin(request);

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const token = request.cookies?.[SESSION_COOKIE] as string | undefined;
    if (token === undefined || token === '') {
      if (isPublic) return true;
      throw new UnauthorizedException('Sign in to continue.');
    }

    let payload: SessionPayload;
    try {
      payload = await this.jwt.verifyAsync<SessionPayload>(token);
    } catch {
      /* An expired or forged cookie is the same as no cookie — but the
         browser is still holding a value that will keep failing, so it is
         dropped here rather than on every later request. */
      response.clearCookie(SESSION_COOKIE, { path: '/' });
      if (isPublic) return true;
      throw new UnauthorizedException(
        'Your session has expired. Sign in again.',
      );
    }

    /* The signature says the server issued it; the row says it still means
       something. One extra read per request is the price of a logout that
       actually logs out rather than merely hiding the cookie. */
    const account = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { sessionRevokedAt: true },
    });

    if (account !== null && !isRevoked(payload, account.sessionRevokedAt)) {
      request.user = {
        id: payload.sub,
        email: payload.email,
        displayName: payload.name,
      };
      return true;
    }

    /* Signed out since this token was issued, or the account is gone. Either
       way the browser is holding a cookie the server no longer honours. */
    response.clearCookie(SESSION_COOKIE, { path: '/' });
    if (isPublic) return true;
    throw new UnauthorizedException(
      account === null
        ? 'Sign in to continue.'
        : 'Your session has expired. Sign in again.',
    );
  }

  private assertSameOrigin(request: Request): void {
    if (!UNSAFE_METHODS.has(request.method)) return;

    const origin = request.headers.origin;
    if (origin === undefined || origin === '') return;

    const host = request.headers.host;
    if (
      host !== undefined &&
      (origin === `http://${host}` || origin === `https://${host}`)
    ) {
      return;
    }

    throw new ForbiddenException(
      'This request came from another site and was refused.',
    );
  }
}

/**
 * Has a sign-out cancelled this token?
 *
 * Two instants are compared: when the token was issued, and the moment
 * `logout` stamped `User.sessionRevokedAt`. Anything issued at or before the
 * sign-out is dead, anything after it is the new session — with `<=` rather
 * than `<`, because "sign me out" has never meant "sign me out except for
 * anything simultaneous".
 *
 * The precision matters more than the operator. The library's `iat` counts
 * *seconds*, so a sign-out at 10:00:00.900 and a re-login at 10:00:00.950
 * would both land on `iat = 10:00:00`, and comparing that against the stamp
 * would condemn a session the user had only just created — a token that
 * stays dead for seven days no matter how many times they sign in during
 * that second. `iatMs` (written by `AuthService.issueToken`) carries the
 * millisecond, which is what makes "sign out, sign straight back in" work
 * while still killing a token that was already issued.
 *
 * A token with neither field cannot be placed on either side of the line, so
 * it does not get the benefit of the doubt: a value the server cannot reason
 * about is not a value it should trust.
 */
function isRevoked(payload: SessionPayload, revokedAt: Date | null): boolean {
  if (revokedAt === null) return false;
  const issuedAt =
    payload.iatMs ??
    (payload.iat === undefined ? undefined : payload.iat * 1000);
  if (issuedAt === undefined) return true;
  return issuedAt <= revokedAt.getTime();
}
