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

    try {
      const payload = await this.jwt.verifyAsync<SessionPayload>(token);
      request.user = {
        id: payload.sub,
        email: payload.email,
        displayName: payload.name,
      };
      return true;
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
