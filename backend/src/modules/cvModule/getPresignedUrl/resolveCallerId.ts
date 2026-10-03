import type { APIGatewayEventRequestContextV2, APIGatewayProxyEventV2 } from 'aws-lambda';

import { UnAuthorizedError } from '@common/ErrorTypes';

/**
 * `@types/aws-lambda` does not model the JWT authorizer on the v2 request
 * context, so the Cognito claims are narrowed locally.
 */
type HttpApiRequestContext = APIGatewayEventRequestContextV2 & {
  authorizer?: {
    jwt?: {
      claims?: {
        sub?: string;
      };
    };
  };
};

/**
 * Reads the caller's Cognito `sub` from the JWT authorizer.
 * The authorizer rejects invalid tokens upstream, so a missing claim means the
 * request reached the function without an identity (401).
 */
export const resolveCallerId = (event: APIGatewayProxyEventV2): string => {
  const requestContext = event.requestContext as HttpApiRequestContext;
  const subject = requestContext.authorizer?.jwt?.claims?.sub;

  if (!subject) {
    throw new UnAuthorizedError('Missing authenticated Cognito identity');
  }

  return subject;
};