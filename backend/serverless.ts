import type { AWS } from '@serverless/typescript';

import { testFunctions } from './src/functions/test';
import { getCustom } from './src/serverless/configs/serverless-common.config';

const Custom = getCustom();

/**
 * Job Scout API — Serverless Framework init stack.
 * Add domain stacks as features grow.
 */
const serverlessConfiguration: AWS = {
  org: 'manakal',
  service: 'job-scout-api',
  frameworkVersion: '4',
  useDotenv: true,
  params: {
    default: {
      basePath: '/${sls:stage}',
    },
    dev: {
      basePath: '/${sls:stage}',
    },
    qa: {
      basePath: '/${sls:stage}',
    },
    stg: {
      basePath: '',
    },
    prod: {
      basePath: '',
    },
  },
  plugins: ['serverless-esbuild', 'serverless-offline', 'serverless-plugin-log-retention'],
  provider: {
    name: 'aws',
    runtime: 'nodejs24.x',
    // No provider.profile — CI uses OIDC default chain; locally set AWS_PROFILE or pass --aws-profile
    stage: '${opt:stage, "dev"}',
    region: '${opt:region, "us-east-1"}' as AWS['provider']['region'],
    apiGateway: {
      minimumCompressionSize: 1024,
      shouldStartNameWithService: true,
    },
    environment: {
      STAGE: '${sls:stage}',
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
    },
    logRetentionInDays: 30,
  },
  functions: {
    ...testFunctions,
  },
  package: {
    individually: true,
  },
  custom: {
    ...Custom,
  },
  build: {
    esbuild: false,
  },
};

module.exports = serverlessConfiguration;
