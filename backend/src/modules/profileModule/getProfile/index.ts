import type { AWS } from '@serverless/typescript';

export const getProfile: NonNullable<AWS['functions']>[string] = {
  handler: 'src/modules/profileModule/getProfile/handler.main',
  timeout: 10,
  events: [
    {
      httpApi: {
        method: 'get',
        path: '/me/profile',
        authorizer: {
          name: 'cognitoJwtAuthorizer',
        },
      },
    },
  ],
};
