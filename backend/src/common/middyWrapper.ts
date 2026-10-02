import middy from '@middy/core';
import cors from '@middy/http-cors';
import httpEventNormalizer from '@middy/http-event-normalizer';
import httpHeaderNormalizer from '@middy/http-header-normalizer';
import httpJsonBodyParser from '@middy/http-json-body-parser';
import httpSecurityHeaders from '@middy/http-security-headers';
import type { APIGatewayEvent, APIGatewayProxyEvent, APIGatewayProxyEventV2, APIGatewayProxyResult, Handler } from 'aws-lambda';

import { errorHandlingMiddleware } from '@common/middleware/errorHandlingMiddleware';

/** Both API Gateway payload formats: REST (v1) and HTTP API (v2). */
export type ApiGatewayEventType = APIGatewayEvent | APIGatewayProxyEventV2;

export type ApiGatewayHandler<TEvent extends ApiGatewayEventType = APIGatewayProxyEvent> = Handler<TEvent, APIGatewayProxyResult>;

/**
 * Standard HTTP middleware stack for API Gateway Lambdas.
 * Order: normalize → parse → security/cors → custom error mapper (last).
 * `TEvent` defaults to the REST payload format; pass `APIGatewayProxyEventV2`
 * for functions attached to an HTTP API (`httpApi` events).
 */
export const wrapper = <TEvent extends ApiGatewayEventType = APIGatewayProxyEvent>(handler: ApiGatewayHandler<TEvent>) =>
  middy(handler)
    .use(httpHeaderNormalizer())
    .use(httpEventNormalizer<TEvent>())
    // GET/DELETE often have no body/Content-Type; don't fail those requests
    .use(httpJsonBodyParser<TEvent>({ disableContentTypeError: true }))
    .use(httpSecurityHeaders())
    .use(cors())
    .use(errorHandlingMiddleware<TEvent>());

export default wrapper;
