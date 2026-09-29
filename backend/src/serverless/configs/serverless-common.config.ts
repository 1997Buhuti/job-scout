import { AWS } from '@serverless/typescript';

export const getCustom = (): AWS['custom'] => {
  return {
    esbuild: {
      bundle: true,
      minify: false,
      sourcemap: false,
      exclude: ['@aws-sdk/*'],
      target: 'node24',
      define: { 'require.resolve': undefined },
      platform: 'node',
      concurrency: 1,
    },
    logRetentionInDays: 30,
    prune: {
      automatic: true,
      number: 10,
    },
    'serverless-offline': {
      httpPort: 3000,
      lambdaPort: 3002,
    },
  };
};
