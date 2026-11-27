import { AWS } from '@serverless/typescript';

/**
 * E1: SES configuration set with a bounce/complaint event destination that
 * publishes to an SNS topic. The `handleSesEvent` Lambda subscribes to it.
 */
export const getSesEventResources = (): AWS['resources'] => ({
  Resources: {
    SesConfigurationSet: {
      Type: 'AWS::SES::ConfigurationSet',
      Properties: {
        Name: 'job-scout-${sls:stage}-config-set',
      },
    },
    SesBounceComplaintTopic: {
      Type: 'AWS::SNS::Topic',
      Properties: {
        TopicName: 'job-scout-${sls:stage}-ses-events',
      },
    },
    // SES can only publish to the topic if the topic policy allows it.
    SesBounceComplaintTopicPolicy: {
      Type: 'AWS::SNS::TopicPolicy',
      Properties: {
        Topics: [{ Ref: 'SesBounceComplaintTopic' }],
        PolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'ses.amazonaws.com' },
              Action: 'sns:Publish',
              Resource: { Ref: 'SesBounceComplaintTopic' },
              Condition: {
                StringEquals: { 'AWS:SourceAccount': '${aws:accountId}' },
              },
            },
          ],
        },
      },
    },
    SesEventDestination: {
      Type: 'AWS::SES::ConfigurationSetEventDestination',
      DependsOn: ['SesBounceComplaintTopicPolicy'],
      Properties: {
        ConfigurationSetName: { Ref: 'SesConfigurationSet' },
        EventDestination: {
          MatchingEventTypes: ['BOUNCE', 'COMPLAINT'],
          SnsDestination: {
            TopicARN: { Ref: 'SesBounceComplaintTopic' },
          },
          Enabled: true,
        },
      },
    },
  },
  Outputs: {
    SesConfigurationSetName: {
      Description: 'SES configuration set name for bounce/complaint handling',
      Value: { Ref: 'SesConfigurationSet' },
      Export: {
        Name: 'job-scout-${sls:stage}-SesConfigurationSetName',
      },
    },
    SesBounceComplaintTopicArn: {
      Description: 'SNS topic ARN for SES bounce/complaint events',
      Value: { Ref: 'SesBounceComplaintTopic' },
      Export: {
        Name: 'job-scout-${sls:stage}-SesBounceComplaintTopicArn',
      },
    },
  },
});
