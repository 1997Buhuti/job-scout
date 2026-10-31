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
  // B3/B4: one shared EventBridge tick dispatches every due user — never a
  // per-user AWS::Events::Rule.
  schedulerDispatcher: {
    handler: 'src/modules/schedulerModule/dispatcher/handler.main',
    timeout: 300,
    memorySize: 1024,
    events: [
      {
        schedule: {
          rate: ['rate(1 hour)'],
        },
      },
    ],
  },
};
