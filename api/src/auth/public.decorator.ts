import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'puong:isPublic';

/**
 * Marks a route as not needing a session.
 *
 * Used on `register` and `login` only. Public is the exception that proves
 * the rule: the global guard runs on every other handler in the application,
 * so forgetting to protect a new endpoint is impossible — a new route is
 * closed until somebody writes `@Public()` on it on purpose.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
