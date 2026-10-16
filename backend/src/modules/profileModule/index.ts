import { AWS } from '@serverless/typescript';

/**
 * Profile module functions.
 */
export const profileFunctions: AWS['functions'] = {
  getProfile: {
    handler: 'src/modules/profileModule/getProfile/handler.main',
    timeout: 10,
    memorySize: 256,
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
  },
  updateProfile: {
    handler: 'src/modules/profileModule/updateProfile/handler.main',
    timeout: 10,
    memorySize: 256,
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
  },
};