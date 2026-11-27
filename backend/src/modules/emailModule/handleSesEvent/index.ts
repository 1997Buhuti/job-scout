import { AWS } from '@serverless/typescript';

/**
 * E3: handleSesEvent Lambda for processing bounce/complaint notifications.
 * Subscribes to the SNS topic created in E1.
 */
export const handleSesEventFunctions: AWS['functions'] = {
  handleSesEvent: {
    handler: 'src/modules/emailModule/handleSesEvent/handler.main',
    timeout: 30,
    memorySize: 256,
    environment: {
      USERS_TABLE_NAME: {
        Ref: 'UsersTable',
      },
    },
    events: [
      {
        sns: {
          arn: { Ref: 'SesBounceComplaintTopic' },
          topicName: 'job-scout-${sls:stage}-ses-events',
        },
      },
    ],
  },
};