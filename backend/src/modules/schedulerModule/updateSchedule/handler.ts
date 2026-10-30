import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  Context,
} from 'aws-lambda';

import { apiResponse } from '@common/apiResponse';
import { SCHEDULER_SERVICE } from '@common/constants';
import { sendErrorResponse } from '@common/ErrorTypes';
import { Logger } from '@common/logger';
import wrapper from '@common/middyWrapper';

import { updateSchedule } from './updateSchedule';

const updateScheduleEndpoint = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  context: Context,
) => {
  const logger = new Logger(SCHEDULER_SERVICE, context.awsRequestId);

  try {
    const profile = await updateSchedule(event);

    logger.info({
      message: 'Schedule updated',
      data: {
        userId: profile.userId,
        scheduleIntervalDays: profile.scheduleIntervalDays,
        schedulerEnabled: profile.schedulerEnabled,
      },
    });
    return apiResponse.ok(profile);
  } catch (err) {
    return sendErrorResponse(err, logger, 'Error updating schedule');
  }
};

export const main = wrapper<APIGatewayProxyEventV2WithJWTAuthorizer>(
  updateScheduleEndpoint,
);
