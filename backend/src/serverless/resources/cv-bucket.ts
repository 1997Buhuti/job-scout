import { AWS } from '@serverless/typescript';

/**
 * Private CV bucket for the CV upload feature (B1).
 *
 * - `BlockPublicAccessConfiguration`: CVs are never public (spec constraint).
 * - SSE-S3 encryption only — cheapest option that still satisfies the spec.
 * - `BucketOwnerEnforced`: no ACLs at all, so only the bucket owner can write.
 * - `CorsConfiguration`: required for the browser PUT (FR-2). The presigned URL
 *   signs `Content-Type: application/pdf`, hence `AllowedHeaders: ['*']`.
 *
 * The name is globally unique in S3, so it may collide on a fresh account.
 * Omit `BucketName` and read the generated name from `Ref` if that happens.
 */
export const getCvBucketResources = (): AWS['resources'] => ({
  Parameters: {
    CvAllowedOrigins: {
      Type: 'String',
      Description: 'Comma-delimited list of origins allowed to PUT a CV directly to the bucket',
      Default: 'http://localhost:3000,http://localhost:3001',
    },
  },
  Resources: {
    CvBucket: {
      Type: 'AWS::S3::Bucket',
      Properties: {
        BucketName: 'job-scout-${sls:stage}-cvs',
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'AES256',
              },
            },
          ],
        },
        OwnershipControls: {
          Rules: [
            {
              ObjectOwnership: 'BucketOwnerEnforced',
            },
          ],
        },
        CorsConfiguration: {
          CorsRules: [
            {
              AllowedOrigins: {
                'Fn::Split': [',', { Ref: 'CvAllowedOrigins' }],
              },
              AllowedMethods: ['PUT'],
              AllowedHeaders: ['*'],
              ExposedHeaders: ['ETag'],
              MaxAge: 3000,
            },
          ],
        },
      },
    },
    UsersTable: {
      Type: 'AWS::DynamoDB::Table',
      Properties: {
        TableName: 'job-scout-${sls:stage}-users',
        AttributeDefinitions: [
          {
            AttributeName: 'userId',
            AttributeType: 'S',
          },
        ],
        KeySchema: [
          {
            AttributeName: 'userId',
            KeyType: 'HASH',
          },
        ],
        BillingMode: 'PAY_PER_REQUEST',
      },
    },
  },
  Outputs: {
    CvBucketName: {
      Description: 'Name of the private CV bucket',
      Value: { Ref: 'CvBucket' },
      Export: {
        Name: 'job-scout-${sls:stage}-CvBucketName',
      },
    },
    UsersTableName: {
      Description: 'DynamoDB users table name (UserProfile)',
      Value: { Ref: 'UsersTable' },
      Export: {
        Name: 'job-scout-${sls:stage}-UsersTableName',
      },
    },
  },
});