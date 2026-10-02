import { AWS } from '@serverless/typescript';

/**
 * `POST /cv/presign` — FR-1 of the CV upload feature.
 *
 * `CV_BUCKET_NAME` is resolved from the `CvBucket` CloudFormation resource
 * declared in `src/serverless/resources/cv-bucket.ts`, so the bucket name
 * never has to be kept in sync by hand.
 */
export const getPresignedUrlFunctions: AWS['functions'] = {
  getPresignedUrl: {
    handler: 'src/modules/cvModule/getPresignedUrl/handler.main',
    timeout: 10,
    memorySize: 256,
    environment: {
      CV_BUCKET_NAME: {
        Ref: 'CvBucket',
      },
    },
    events: [
      {
        httpApi: {
          method: 'post',
          path: '/cv/presign',
          authorizer: {
            name: 'cognitoJwtAuthorizer',
          },
        },
      },
    ],
  },
};