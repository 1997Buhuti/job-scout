import type { AWS } from '@serverless/typescript';

/**
 * `POST /cv/parse` - persist the uploaded CV on the authenticated user's
 * `UserProfile`: the latest object key plus the structured `cvProfile` the
 * browser extracted (validated and sanitized here). The Lambda does not read
 * or parse the PDF itself.
 */
export const parseCvPdfFunctions: AWS['functions'] = {
  parseCvPdf: {
    handler: 'src/modules/cvModule/parseCvPdf/handler.main',
    timeout: 30,
    memorySize: 512,
    environment: {
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
