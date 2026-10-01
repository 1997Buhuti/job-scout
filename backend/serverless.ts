import type { AWS } from '@serverless/typescript';

import { testFunctions } from './src/functions/test';
import { profileFunctions } from './src/modules/profileModule';
import { getCustom } from './src/serverless/configs/serverless-common.config';
import { usersTableResources } from './src/serverless/resources/users-table';

const Custom = getCustom();

/**
 * Job Scout API — Serverless Framework init stack.
 * Add domain stacks as features grow.
 */
const serverlessConfiguration: AWS = {
  service: 'job-scout-api',
  frameworkVersion: '4',
  useDotenv: true,
  params: {
    default: {
      basePath: '/${sls:stage}',
      // Cognito issuer + audience from SSM (set after Amplify sandbox/deploy). Not secrets.
      cognitoIssuerUrl: '${ssm:/job-scout/${sls:stage}/cognito-issuer-url}',
      cognitoAppClientId: '${ssm:/job-scout/${sls:stage}/cognito-app-client-id}',
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
    httpApi: {
      cors: true,
      authorizers: {
        cognitoJwtAuthorizer: {
          type: 'jwt',
          identitySource: '$request.header.Authorization',
          issuerUrl: '${param:cognitoIssuerUrl}',
          audience: ['${param:cognitoAppClientId}'],
        },
      },
    },
    environment: {
      STAGE: '${sls:stage}',
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      USERS_TABLE_NAME: 'job-scout-${sls:stage}-users',
    },
    iam: {
      role: {
        statements: [
          {
            Effect: 'Allow',
            Action: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'],
            Resource: 'arn:aws:dynamodb:${aws:region}:${aws:accountId}:table/job-scout-${sls:stage}-users',
          },
        ],
      },
    },
    logRetentionInDays: 30,
  },
  functions: {
    ...testFunctions,
    ...profileFunctions,
  },
  package: {
    individually: true,
  },
  custom: {
    ...Custom,
  },
  resources: {
    Resources: {
      ...usersTableResources.Resources,
    },
    Outputs: {
      ...usersTableResources.Outputs,
    },
  },
  build: {
    esbuild: false,
  },
};

module.exports = serverlessConfiguration;
