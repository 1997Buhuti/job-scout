import { AWS } from '@serverless/typescript';

/**
 * Scheduler module functions.
 */
export const schedulerFunctions: AWS['functions'] = {
  updateSchedule: {
    handler: 'src/modules/schedulerModule/updateSchedule/handler.main',
    timeout: 10,
    memorySize: 256,
    events: [
      {
        httpApi: {
          method: 'put',
          path: '/me/schedule',
          authorizer: {
            name: 'cognitoJwtAuthorizer',
          },
        },
      },
    ],
  },
};
