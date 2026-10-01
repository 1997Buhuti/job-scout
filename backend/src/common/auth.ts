import type { APIGatewayProxyEvent, APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

import { UnAuthorizedError } from '@common/ErrorTypes';

export type AuthClaims = {
  userId: string;
  email: string;
};

type JwtAuthorizerEvent = APIGatewayProxyEventV2WithJWTAuthorizer | APIGatewayProxyEvent;

/**
 * Extract Cognito Sub + email from API Gateway JWT / Cognito authorizer claims.
 * Supports HTTP API (`authorizer.jwt.claims`) and REST Cognito authorizer (`authorizer.claims`).
 */
export const getAuthClaims = (event: JwtAuthorizerEvent): AuthClaims => {
  const restClaims = (event as APIGatewayProxyEvent).requestContext?.authorizer?.claims as
    | Record<string, string>
    | undefined;

  const httpApiClaims = (event as APIGatewayProxyEventV2WithJWTAuthorizer).requestContext?.authorizer?.jwt
    ?.claims as Record<string, string> | undefined;

  const claims = httpApiClaims ?? restClaims;

  const userId = claims?.sub?.trim();
  const email = claims?.email?.trim();

  if (!userId) {
    throw new UnAuthorizedError('Missing Cognito subject claim');
  }

  if (!email) {
    throw new UnAuthorizedError('Missing email claim');
  }

  return { userId, email };
};
