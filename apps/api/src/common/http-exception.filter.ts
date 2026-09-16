import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@topflow/database';
import { InvalidTransitionError, type ApiErrorBody } from '@topflow/shared';
import type { Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import type { AppRequest } from './request-context';

interface ZodIssueLike {
  path: PropertyKey[];
  message: string;
}

/**
 * One error envelope for every failure: validation, domain rule violations, database
 * constraint errors and unexpected crashes. Internal details never leak to clients —
 * they are logged with the request id instead.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<AppRequest>();
    const response = http.getResponse<Response>();
    const body = this.toBody(exception);
    body.requestId = request.requestId;

    if (body.statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl} → ${body.statusCode} [${request.requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ApiErrorBody {
    if (exception instanceof ZodValidationException) {
      const issues =
        (exception.getZodError() as { issues?: ZodIssueLike[] }).issues ?? [];
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: issues[0]?.message ?? 'Validation failed',
        details: issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const raw =
        typeof payload === 'string'
          ? payload
          : (payload as { message?: unknown }).message;
      const first: unknown = Array.isArray(raw) ? (raw as unknown[])[0] : raw;
      const message = typeof first === 'string' ? first : exception.message;
      const code =
        typeof payload === 'object' && payload !== null
          ? (payload as { code?: unknown }).code
          : undefined;
      return {
        statusCode: status,
        error: httpStatusName(status),
        message,
        ...(typeof code === 'string' && { code }),
      };
    }

    if (exception instanceof InvalidTransitionError) {
      return {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: exception.message,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          return {
            statusCode: HttpStatus.CONFLICT,
            error: 'Conflict',
            message: `A record with this ${uniqueFields(exception.meta)} already exists`,
          };
        }
        case 'P2025':
          return {
            statusCode: HttpStatus.NOT_FOUND,
            error: 'Not Found',
            message: 'The requested record was not found',
          };
        case 'P2003':
          return {
            statusCode: HttpStatus.CONFLICT,
            error: 'Conflict',
            message: 'This record is still referenced by other data',
          };
      }
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Something went wrong. Please try again later.',
    };
  }
}

/** Unique-constraint fields: `meta.target` (classic engine) or the driver adapter's constraint info (Prisma 7). */
function uniqueFields(meta: Record<string, unknown> | undefined): string {
  const adapterError = meta?.driverAdapterError as
    { cause?: { constraint?: { fields?: string[] } } } | undefined;
  const target = meta?.target ?? adapterError?.cause?.constraint?.fields;
  if (Array.isArray(target) && target.length > 0)
    return target.map(String).join(', ');
  if (typeof target === 'string') return target;
  return 'value';
}

function httpStatusName(status: number): string {
  const name = HttpStatus[status];
  return typeof name === 'string'
    ? name
        .toLowerCase()
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    : 'Error';
}
