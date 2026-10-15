import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';

import { apiResponse } from '@common/apiResponse';
import { PROFILE_SERVICE } from '@common/constants';
import { sendErrorResponse } from '@common/ErrorTypes';
import { Logger } from '@common/logger';
import wrapper from '@common/middyWrapper';

import { getProfile } from './getProfile';

const getProfileEndpoint = async (
  event: APIGatewayProxyEventV2,
  context: Context,
) => {
  const logger = new Logger(PROFILE_SERVICE, context.awsRequestId);

  try {
    const profile = await getProfile(event);

    logger.info({
      message: 'Profile retrieved',
      data: { userId: profile.userId, created: profile.createdAt },
    });
    return apiResponse.ok(profile);
  } catch (err) {
    return sendErrorResponse(err, logger, 'Error retrieving profile');
  }
};

export const main = wrapper<APIGatewayProxyEventV2>(getProfileEndpoint);
