import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from './errors';

interface ErrorBody {
  error: { code: string; message: string; fields?: Record<string, string[]>; requestId?: string };
}

const HTTP_CODES: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  422: 'validation_failed',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  429: 'rate_limited',
};

/** Client errors raised by Express middleware (body-parser and friends) carry a 4xx `status` and `expose: true`. */
function isExpressClientError(e: unknown): e is { status: number; message: string } {
  const err = e as { status?: unknown; expose?: unknown };
  return typeof err?.status === 'number' && err.status >= 400 && err.status < 500 && err.expose === true;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<{ id?: string }>();
    const [status, body] = this.toResponse(exception);
    if (status >= 500) {
      // Full detail goes to the log; the client gets a stable message plus the id to quote (nodebestpractices 6.20).
      this.logger.error({ err: exception, requestId: req.id }, 'Unhandled error');
      body.error.requestId = req.id;
    }
    res.status(status).json(body);
  }

  private toResponse(exception: unknown): [number, ErrorBody] {
    if (exception instanceof AppError) {
      return [exception.status, { error: { code: exception.code, message: exception.message, fields: exception.fields } }];
    }

    if (exception instanceof ZodError) {
      const fields: Record<string, string[]> = {};
      for (const issue of exception.issues) {
        const key = issue.path.join('.') || '_';
        (fields[key] ??= []).push(issue.message);
      }
      const first = exception.issues[0]?.message ?? 'Check the highlighted fields.';
      return [422, { error: { code: 'validation_failed', message: first, fields } }];
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
      return [409, { error: { code: 'conflict', message: 'This record already exists.' } }];
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        status === 429
          ? 'Too many attempts. Try again in a few minutes.'
          : typeof response === 'string'
            ? response
            : ((response as { message?: string | string[] }).message?.toString() ?? exception.message);
      return [status, { error: { code: HTTP_CODES[status] ?? 'error', message } }];
    }

    if (isExpressClientError(exception)) {
      const message = exception.status === 413 ? 'The request is too large.' : 'The request could not be read.';
      return [exception.status, { error: { code: HTTP_CODES[exception.status] ?? 'bad_request', message } }];
    }

    return [500, { error: { code: 'server_error', message: 'Something went wrong on our side.' } }];
  }
}
