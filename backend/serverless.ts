import type { AWS } from '@serverless/typescript';

import { testFunctions } from './src/functions/test';
import { profileFunctions } from './src/modules/profileModule';
import { schedulerFunctions } from './src/modules/schedulerModule';
import { getPresignedUrlFunctions } from './src/modules/cvModule/getPresignedUrl';
import { parseCvPdfFunctions } from './src/modules/cvModule/parseCvPdf';
import { getCustom } from './src/serverless/configs/serverless-common.config';
import { getCvBucketResources } from './src/serverless/resources/cv-bucket';
import { getJobsTableResources } from './src/serverless/resources/jobs-table';
import { getMatchesTableResources } from './src/serverless/resources/matches-table';

const Custom = getCustom();
const cvBucketResources = getCvBucketResources();
const jobsTableResources = getJobsTableResources();
const matchesTableResources = getMatchesTableResources();
const Resources: AWS['resources'] = {
  ...cvBucketResources,
  Resources: {
    ...cvBucketResources.Resources,
    ...jobsTableResources.Resources,
    ...matchesTableResources.Resources,
  },
  Outputs: {
    ...cvBucketResources.Outputs,
    ...jobsTableResources.Outputs,
    ...matchesTableResources.Outputs,
  },
};

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
      // Cognito values live in SSM so pool IDs stay out of git. Set
      // COGNITO_ISSUER_URL / COGNITO_APP_CLIENT_ID to override locally
      // (e.g. serverless-offline) without the SSM parameters existing.
      cognitoIssuerUrl: '${env:COGNITO_ISSUER_URL, ssm:/job-scout/${sls:stage}/cognito-issuer-url}',
      cognitoAppClientId: '${env:COGNITO_APP_CLIENT_ID, ssm:/job-scout/${sls:stage}/cognito-app-client-id}',
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
    // Every route lives on the HTTP API (v2). Cognito-authenticated: /cv/*,
    // /me/* once the profile module lands. GET /test stays public.
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
      USERS_TABLE_NAME: {
        Ref: 'UsersTable',
      },
      JOBS_TABLE_NAME: {
        Ref: 'JobsTable',
      },
      MATCHES_TABLE_NAME: {
        Ref: 'MatchesTable',
      },
      SES_FROM_ADDRESS: '${env:SES_FROM_ADDRESS, ssm:/job-scout/${sls:stage}/ses-from-address}',
      // Account is in the SES sandbox: recipients must be verified. Set to
      // "false" once production access is granted (task P3).
      SES_SANDBOX_MODE: '${env:SES_SANDBOX_MODE, "true"}',
      BEDROCK_MODEL_ID: '${env:BEDROCK_MODEL_ID, ssm:/job-scout/${sls:stage}/bedrock-model-id}',
      MAX_USERS_PER_DISPATCH: '${env:MAX_USERS_PER_DISPATCH, "5"}',
      MAX_SEARCH_ROLES_PER_SOURCE: '${env:MAX_SEARCH_ROLES_PER_SOURCE, "3"}',
      MAX_JOBS_PER_SOURCE: '${env:MAX_JOBS_PER_SOURCE, "20"}',
      MAX_BEDROCK_EVALUATIONS_PER_USER:
        '${env:MAX_BEDROCK_EVALUATIONS_PER_USER, "20"}',
      MAX_BEDROCK_DESCRIPTION_CHARS:
        '${env:MAX_BEDROCK_DESCRIPTION_CHARS, "6000"}',
    },
    // Merged into the default Lambda execution role, which keeps its
    // CloudWatch Logs grants.
    iam: {
      role: {
        statements: [
          {
            Effect: 'Allow',
            Action: ['s3:PutObject'],
            // Object ARN (`bucket/*`) — PutObject is object-level; a bare
            // bucket ARN makes every browser PUT via the presigned URL 403.
            Resource: {
              'Fn::Join': [
                '',
                [{ 'Fn::GetAtt': ['CvBucket', 'Arn'] }, '/*'],
              ],
            },
          },
          {
            Effect: 'Allow',
            Action: ['s3:GetObject'],
            Resource: {
              'Fn::Join': [
                '',
                [{ 'Fn::GetAtt': ['CvBucket', 'Arn'] }, '/*'],
              ],
            },
          },
           {
             Effect: 'Allow',
             Action: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'],
             Resource: {
               'Fn::GetAtt': ['UsersTable', 'Arn'],
             },
           },
           {
             Effect: 'Allow',
             // BatchGetItem: job details for older unsent matches in a digest.
             Action: [
               'dynamodb:GetItem',
               'dynamodb:BatchGetItem',
               'dynamodb:PutItem',
               'dynamodb:UpdateItem',
             ],
             Resource: {
               'Fn::GetAtt': ['JobsTable', 'Arn'],
             },
           },
           {
             Effect: 'Allow',
             Action: [
               'dynamodb:GetItem',
               'dynamodb:BatchGetItem',
               'dynamodb:PutItem',
               'dynamodb:UpdateItem',
               'dynamodb:Query',
             ],
             Resource: [
               { 'Fn::GetAtt': ['MatchesTable', 'Arn'] },
               {
                 'Fn::Join': [
                   '',
                   [{ 'Fn::GetAtt': ['MatchesTable', 'Arn'] }, '/index/GSI1'],
                 ],
               },
             ],
           },
           {
             Effect: 'Allow',
             Action: ['dynamodb:Query'],
             Resource: {
               'Fn::Join': [
                 '',
                 [{ 'Fn::GetAtt': ['UsersTable', 'Arn'] }, '/index/GSI1'],
               ],
             },
           },
           {
             Effect: 'Allow',
             Action: ['bedrock:InvokeModel'],
             Resource:
               'arn:aws:bedrock:${aws:region}::foundation-model/amazon.nova-lite-v1:0',
           },
           {
             Effect: 'Allow',
             // Digests go through SES v2 SendEmail (emailModule/sesSend).
             // Scoped to the configured sender with ses:FromAddress rather
             // than to one identity ARN: in the sandbox, SES can also
             // authorize against the recipient's identity, which a
             // sender-only Resource would deny. Add the configuration set
             // ARN here when E1 attaches one to sends.
             Action: ['ses:SendEmail'],
             Resource: 'arn:aws:ses:${aws:region}:${aws:accountId}:identity/*',
             Condition: {
               StringEquals: {
                 'ses:FromAddress': '${self:provider.environment.SES_FROM_ADDRESS}',
               },
             },
           },
           {
             Effect: 'Allow',
             // Sandbox recipient verification (emailModule/recipientStatus)
             // and the sender domain check (emailModule/senderCheck).
             Action: ['ses:CreateEmailIdentity', 'ses:GetEmailIdentity'],
             Resource: 'arn:aws:ses:${aws:region}:${aws:accountId}:identity/*',
           },
        ],
      },
    },
    logRetentionInDays: 30,
  },
  functions: {
    ...testFunctions,
    ...getPresignedUrlFunctions,
    ...parseCvPdfFunctions,
    ...profileFunctions,
    ...schedulerFunctions,
  },
  package: {
    individually: true,
  },
  resources: Resources,
  custom: {
    ...Custom,
  },
  build: {
    esbuild: false,
  },
};

module.exports = serverlessConfiguration;
