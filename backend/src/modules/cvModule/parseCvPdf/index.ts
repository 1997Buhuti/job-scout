import type { AWS } from '@serverless/typescript';

/**
 * `POST /cv/parse` — parse a previously uploaded CV PDF and persist the
 * latest object key on the authenticated user's `UserProfile` record.
 */
export const parseCvPdfFunctions: AWS['functions'] = {
  parseCvPdf: {
    handler: 'src/modules/cvModule/parseCvPdf/handler.main',
    timeout: 30,
    memorySize: 512,
    environment: {
      CV_BUCKET_NAME: {
        Ref: 'CvBucket',
      },
      USERS_TABLE_NAME: {
        Ref: 'UsersTable',
      },
    },
    events: [
      {
        httpApi: {
          method: 'post',
          path: '/cv/parse',
          authorizer: {
            name: 'cognitoJwtAuthorizer',
          },
        },
      },
    ],
  },
};
