import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

import { apiResponse } from '@common/apiResponse';
import { getAuthClaims } from '@common/auth';
import { PROFILE_SERVICE } from '@common/constants';
import { sendErrorResponse } from '@common/ErrorTypes';
import { Logger } from '@common/logger';
import wrapper from '@common/middyWrapper';
import { getOrCreateProfile } from '@data/userProfile';

const getProfile = async (event: APIGatewayProxyEvent, context: Context) => {
  const logger = new Logger(PROFILE_SERVICE, context.awsRequestId);

  try {
    const { userId, email } = getAuthClaims(event);
    logger.info({ message: 'getProfile', userId });

    const profile = await getOrCreateProfile(userId, email);
    return apiResponse.ok(profile);
  } catch (err) {
    return sendErrorResponse(err, logger, 'Error on getProfile');
  }
};

export const main = wrapper(getProfile);
