import { AWS } from '@serverless/typescript';

import { corsSettings } from '@functions/function.config';

export const testFunctions: AWS['functions'] = {
  TestEndpoint: {
    handler: 'src/functions/test/handler.main',
    timeout: 10,
    events: [
      {
        http: {
          method: 'GET',
          path: 'test',
          cors: corsSettings,
        },
      },
    ],
  },
};
