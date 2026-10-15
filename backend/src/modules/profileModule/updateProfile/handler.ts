import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';

import { apiResponse } from '@common/apiResponse';
import { PROFILE_SERVICE } from '@common/constants';
import { sendErrorResponse } from '@common/ErrorTypes';
import { Logger } from '@common/logger';
import wrapper from '@common/middyWrapper';

import { updateProfile } from './updateProfile';

const updateProfileEndpoint = async (
  event: APIGatewayProxyEventV2,
  context: Context,
) => {
  const logger = new Logger(PROFILE_SERVICE, context.awsRequestId);

  try {
    const profile = await updateProfile(event);

    logger.info({
      message: 'Profile updated',
      data: {
        userId: profile.userId,
        targetRolesCount: profile.targetRoles.length,
      },
    });
    return apiResponse.ok(profile);
  } catch (err) {
    return sendErrorResponse(err, logger, 'Error updating profile');
  }
};

export const main = wrapper<APIGatewayProxyEventV2>(updateProfileEndpoint);
