import type middy from '@middy/core';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

import { ERROR_MIDDLEWARE } from '@common/constants';
import { isAppError, toErrorResponse } from '@common/ErrorTypes';
import { Logger } from '@common/logger';

/**
 * Maps thrown errors to API Gateway responses.
 * Register last so `onError` runs first and can short-circuit the chain.
 */
export const errorHandlingMiddleware = (): middy.MiddlewareObj<APIGatewayProxyEvent, APIGatewayProxyResult> => {
  const onError: middy.MiddlewareFn<APIGatewayProxyEvent, APIGatewayProxyResult> = async (request) => {
    const logger = new Logger(ERROR_MIDDLEWARE, request.context?.awsRequestId);
    const error = request.error;

    if (!error) {
      return;
    }

    if (!isAppError(error) || !error.expose) {
      logger.error(error, 'Unhandled error in middleware');
    }

    request.response = toErrorResponse(error);
  };

  return { onError };
};
