import { AWS } from '@serverless/typescript';

/**
 * U3: unsubscribe Lambda and public GET /unsubscribe route.
 * Covers AC-12: confirms/unsubscribes the user and returns a web page.
 */
export const unsubscribeFunctions: AWS['functions'] = {
  unsubscribe: {
    handler: 'src/modules/emailModule/unsubscribe/handler.main',
    timeout: 10,
    memorySize: 256,
    events: [
      {
        httpApi: {
          method: 'get',
          path: '/unsubscribe',
        },
      },
    ],
  },
};
