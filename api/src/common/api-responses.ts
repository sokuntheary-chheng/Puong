import type { ApiResponseOptions } from '@nestjs/swagger';
import { ErrorDto } from './error.dto';

/**
 * The four errors almost every endpoint can return, named once.
 *
 * They are options objects rather than decorators so a controller can write
 * `@ApiBadRequestResponse(BAD_REQUEST)` and get the same description on every
 * endpoint — Swagger's documentation of an error should not be a place where
 * two endpoints can quietly disagree about what a 404 means.
 */
export const BAD_REQUEST: ApiResponseOptions = {
  type: ErrorDto,
  description: 'Validation failed. `message` names each field and why.',
};

export const NOT_FOUND: ApiResponseOptions = {
  type: ErrorDto,
  description: 'No record with that id — or none in that tree.',
};

export const CONFLICT: ApiResponseOptions = {
  type: ErrorDto,
  description:
    'The record already exists (unique constraint), or the operation would break a relationship.',
};

export const UNAUTHORIZED: ApiResponseOptions = {
  type: ErrorDto,
  description:
    'No session, or one that has expired: `401` before the handler runs. Sign in at `POST /auth/login`.',
};

export const FORBIDDEN: ApiResponseOptions = {
  type: ErrorDto,
  description:
    'You are a member of the tree, but your role (or your ownership of this record) does not reach this far.',
};

export const SERVER_ERROR: ApiResponseOptions = {
  type: ErrorDto,
  description: 'Unexpected failure. The message never exposes the schema.',
};
