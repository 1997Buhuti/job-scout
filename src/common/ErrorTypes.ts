import type { APIGatewayProxyResult } from 'aws-lambda';

import { apiResponse } from './apiResponse';
import { Logger } from './logger';

export type AppErrorOptions = {
  statusCode?: number;
  code?: string;
  expose?: boolean;
  cause?: unknown;
  errorCode?: string;
  errorParams?: Record<string, string>;
};

/**
 * Base HTTP-aware application error. Prefer throwing these from handlers;
 * middleware / sendErrorResponse map them to consistent API responses.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly expose: boolean;
  readonly errorCode?: string;
  readonly errorParams?: Record<string, string>;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? this.name;
    this.expose = options.expose ?? this.statusCode < 500;
    this.errorCode = options.errorCode;
    this.errorParams = options.errorParams;
  }
}

export class ApplicationError extends AppError {
  constructor(message = 'Application Server Error', cause?: unknown) {
    super(message, { statusCode: 500, code: 'APPLICATION_ERROR', expose: false, cause });
  }
}

export class ResourceNotFoundError extends AppError {
  constructor(message = 'Resource Not Found', cause?: unknown) {
    super(message, { statusCode: 404, code: 'RESOURCE_NOT_FOUND', expose: true, cause });
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', cause?: unknown) {
    super(message, { statusCode: 400, code: 'BAD_REQUEST', expose: true, cause });
  }
}

export class UnAuthorizedError extends AppError {
  constructor(message = 'Unauthorized', cause?: unknown) {
    super(message, { statusCode: 401, code: 'UNAUTHORIZED', expose: true, cause });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', cause?: unknown) {
    super(message, { statusCode: 403, code: 'FORBIDDEN', expose: true, cause });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', cause?: unknown) {
    super(message, { statusCode: 409, code: 'CONFLICT', expose: true, cause });
  }
}

export class DatabaseError extends AppError {
  constructor(message = 'Request failed due to database error', cause?: unknown) {
    super(message, { statusCode: 500, code: 'DATABASE_ERROR', expose: false, cause });
  }
}

export const isAppError = (err: unknown): err is AppError => err instanceof AppError;

export const toErrorResponse = (err: unknown): APIGatewayProxyResult => {
  if (isAppError(err)) {
    return apiResponse.failure(err, err.statusCode);
  }

  if (err instanceof Error) {
    const statusCode = (err as Error & { statusCode?: number }).statusCode;
    const expose = (err as Error & { expose?: boolean }).expose;

    if (expose === true && typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      return apiResponse.fromStatus(statusCode, err.message, err.name);
    }

    return apiResponse.failure(new ApplicationError(err.message, err), 500);
  }

  return apiResponse.failure(new ApplicationError('Unexpected error'), 500);
};

export const sendErrorResponse = (err: unknown, logger: Logger, message: string): APIGatewayProxyResult => {
  if (isAppError(err) && err.expose) {
    return toErrorResponse(err);
  }

  logger.error(err, message);
  return apiResponse.failure(new ApplicationError(message, err), 500);
};

export type ErrorType =
  | ApplicationError
  | ResourceNotFoundError
  | BadRequestError
  | UnAuthorizedError
  | ForbiddenError
  | ConflictError
  | DatabaseError;
