import type { AWS } from '@serverless/typescript';

export const updateProfile: NonNullable<AWS['functions']>[string] = {
  handler: 'src/modules/profileModule/updateProfile/handler.main',
  timeout: 10,
  events: [
    {
      httpApi: {
        method: 'put',
        path: '/me/profile',
        authorizer: {
          name: 'cognitoJwtAuthorizer',
        },
      },
    },
  ],
};
