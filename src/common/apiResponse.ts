import type { APIGatewayProxyResult } from 'aws-lambda';

import { FORBIDDEN, UNAUTHORIZED } from '@common/constants';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
} as const;

export type ApiSuccessBody<T> = { data: T };
export type ApiErrorBody = {
  error: {
    message: string;
    code: string;
    errorCode?: string;
    errorParams?: Record<string, string>;
  };
};

const respond = (statusCode: number, body?: unknown): APIGatewayProxyResult => {
  if (body === undefined) {
    return { statusCode, body: '' };
  }

  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
};

const errorBody = (
  message: string,
  code: string,
  extras?: { errorCode?: string; errorParams?: Record<string, string> },
): ApiErrorBody => ({
  error: {
    message,
    code,
    ...extras,
  },
});

/**
 * Consistent API Gateway JSON responses.
 * Success → `{ data }`; errors → `{ error: { message, code } }`.
 */
export const apiResponse = {
  ok: <T>(data: T) => respond(200, { data } satisfies ApiSuccessBody<T>),
  created: <T>(data?: T) => respond(201, { data } satisfies ApiSuccessBody<T | undefined>),
  noContent: () => respond(204),

  badRequest: (message: string, code = 'BAD_REQUEST') => respond(400, errorBody(message, code)),
  unauthorized: (message = 'Unauthorized', code = UNAUTHORIZED) => respond(401, errorBody(message, code)),
  forbidden: (message = 'Forbidden', code = FORBIDDEN) => respond(403, errorBody(message, code)),
  notFound: (message = 'Not Found', code = 'NOT_FOUND') => respond(404, errorBody(message, code)),
  conflict: (message: string, code = 'CONFLICT') => respond(409, errorBody(message, code)),
  failure: (
    err: Error & { code?: string; errorCode?: string; errorParams?: Record<string, string> },
    statusCode = 500,
  ) =>
    respond(
      statusCode,
      errorBody(err.message, err.code ?? err.name, {
        errorCode: err.errorCode,
        errorParams: err.errorParams,
      }),
    ),

  fromStatus: (statusCode: number, message: string, code: string) => respond(statusCode, errorBody(message, code)),
};
