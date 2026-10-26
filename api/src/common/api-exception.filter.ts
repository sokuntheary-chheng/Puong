import { STATUS_CODES } from 'node:http';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/**
 * The one error body every endpoint returns, in the shape wind.md Appendix B
 * asks for:
 *
 * ```json
 * { "statusCode": 400, "message": ["capacity must be a positive number"], "error": "Bad Request" }
 * ```
 *
 * `message` is **always an array of strings**, whatever produced the error.
 * Nest's own validation errors already look like that; a plain
 * `new NotFoundException('tree t1 was not found.')` does not — it returns a
 * single string — and Prisma's unique-constraint errors are not HTTP errors at
 * all. Normalising here rather than at every throw site means a client only
 * has to know one shape, and the "consistent error JSON" item is satisfied by
 * construction rather than by discipline.
 */
export interface ErrorBody {
  statusCode: number;
  message: string[];
  error: string;
}

/**
 * Prisma errors that have an obvious HTTP meaning.
 *
 * Anything not listed here would be a bug in a query, and is reported as a
 * 500 with a message that reveals nothing about the schema — an error body is
 * read by whoever holds the request, and they have no business seeing table
 * or column names.
 */
const PRISMA_ERRORS: Record<string, { status: number; message: string }> = {
  // Unique constraint violated — the same link twice, the same email twice.
  P2002: { status: 409, message: 'That value is already taken.' },
  // Foreign key violated — a referenced row does not exist.
  P2003: {
    status: 400,
    message: 'A record this one refers to does not exist.',
  },
  // Required relation would be left without a parent.
  P2014: {
    status: 409,
    message: 'The operation would break a required relationship.',
  },
  // Record to update or delete was not found (Prisma's own 404).
  P2025: { status: 404, message: 'That record no longer exists.' },
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);

    if (body.statusCode >= 500) {
      // Logged with the real exception — the client is not shown it.
      this.logger.error(
        `Unhandled error: ${exception instanceof Error ? exception.stack : String(exception)}`,
      );
    }

    /* A 429 tells the caller when to come back. The throttler has already
       written its own, precise `Retry-After` onto the response before
       throwing; this fills in the round number for the sign-in limiter,
       whose window is a minute. Setting a header that is already there
       would replace a better answer with a worse one. */
    if (
      body.statusCode === 429 &&
      response.getHeader('Retry-After') === undefined
    ) {
      response.set('Retry-After', '60');
    }

    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const known = PRISMA_ERRORS[exception.code];
      if (known) {
        return {
          statusCode: known.status,
          message: [known.message, ...this.constraintTargets(exception)],
          error: STATUS_CODES[known.status] ?? 'Error',
        };
      }
    }

    return {
      statusCode: 500,
      message: ['Internal server error.'],
      error: STATUS_CODES[500] ?? 'Error',
    };
  }

  private fromHttpException(exception: HttpException): ErrorBody {
    const status = exception.getStatus();

    /* Rate limiting arrives from `@nestjs/throttler`, whose message is
       `"ThrottlerException: Too Many Requests"` — a class name pasted into a
       sentence a person will read. The status and the three-field shape are
       the contract; the words are ours to choose. */
    if (status === 429) {
      return {
        statusCode: 429,
        message: ['Too many requests. Wait a moment and try again.'],
        error: STATUS_CODES[429] ?? 'Too Many Requests',
      };
    }

    const raw = exception.getResponse();
    const text =
      typeof raw === 'string'
        ? [raw]
        : Array.isArray(raw)
          ? raw.map(String)
          : this.messagesFrom(raw as Record<string, unknown>);

    return {
      statusCode: status,
      message: text.length > 0 ? text : [STATUS_CODES[status] ?? 'Error'],
      error: STATUS_CODES[status] ?? 'Error',
    };
  }

  private messagesFrom(raw: Record<string, unknown>): string[] {
    const message = raw.message;
    if (Array.isArray(message)) return message.map(String);
    if (typeof message === 'string' && message !== '') return [message];
    if (typeof raw.error === 'string' && raw.error !== '') return [raw.error];
    return [];
  }

  /** "…already exists" is more useful when it names the column that clashed. */
  private constraintTargets(
    exception: Prisma.PrismaClientKnownRequestError,
  ): string[] {
    const target = exception.meta?.target;
    if (typeof target === 'string') return [`(column: ${target})`];
    if (Array.isArray(target)) return [`(columns: ${target.join(', ')})`];
    return [];
  }
}
