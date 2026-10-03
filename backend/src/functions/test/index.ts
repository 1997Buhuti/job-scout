import { AWS } from '@serverless/typescript';

export const testFunctions: AWS['functions'] = {
  TestEndpoint: {
    handler: 'src/functions/test/handler.main',
    timeout: 10,
    events: [
      {
        httpApi: {
          method: 'get',
          path: '/test',
        },
      },
    ],
  },
};