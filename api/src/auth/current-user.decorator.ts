import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Actor } from './auth.guard';

/**
 * The signed-in account, read from the request the guard filled in.
 *
 * Never from the body or a query parameter: identity is the one thing a
 * client must not be able to claim about itself (M3 security checklist).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Actor => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: Actor }>();
    const user = request.user;
    if (user === undefined) {
      // Unreachable while the global guard runs first; a clear message
      // beats `undefined.id` if a handler is ever wired up out of order.
      throw new Error('No session on the request: AuthGuard did not run.');
    }
    return user;
  },
);
