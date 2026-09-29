import middy from '@middy/core';
import cors from '@middy/http-cors';
import httpEventNormalizer from '@middy/http-event-normalizer';
import httpHeaderNormalizer from '@middy/http-header-normalizer';
import httpJsonBodyParser from '@middy/http-json-body-parser';
import httpSecurityHeaders from '@middy/http-security-headers';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Handler } from 'aws-lambda';

import { errorHandlingMiddleware } from '@common/middleware/errorHandlingMiddleware';

export type ApiGatewayHandler = Handler<APIGatewayProxyEvent, APIGatewayProxyResult>;

/**
 * Standard HTTP middleware stack for API Gateway Lambdas.
 * Order: normalize → parse → security/cors → custom error mapper (last).
 */
export const wrapper = (handler: ApiGatewayHandler) =>
  middy(handler)
    .use(httpHeaderNormalizer())
    .use(httpEventNormalizer())
    // GET/DELETE often have no body/Content-Type; don't fail those requests
    .use(httpJsonBodyParser({ disableContentTypeError: true }))
    .use(httpSecurityHeaders())
    .use(cors())
    .use(errorHandlingMiddleware());

export default wrapper;
