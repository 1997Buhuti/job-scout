import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

import { apiResponse } from '@common/apiResponse';
import { getAuthClaims } from '@common/auth';
import { PROFILE_SERVICE } from '@common/constants';
import { BadRequestError, ResourceNotFoundError, sendErrorResponse } from '@common/ErrorTypes';
import { Logger } from '@common/logger';
import wrapper from '@common/middyWrapper';
import { getOrCreateProfile, updateTargetRoles } from '@data/userProfile';
import { validateTargetRoles } from '@modules/profileModule/validateTargetRoles';

type UpdateProfileBody = {
  targetRoles?: unknown;
};

const updateProfile = async (event: APIGatewayProxyEvent, context: Context) => {
  const logger = new Logger(PROFILE_SERVICE, context.awsRequestId);

  try {
    const { userId, email } = getAuthClaims(event);
    const body = (event.body ?? {}) as UpdateProfileBody;

    if (body.targetRoles === undefined) {
      throw new BadRequestError('targetRoles is required');
    }

    const targetRoles = validateTargetRoles(body.targetRoles);
    logger.info({ message: 'updateProfile', userId, roleCount: targetRoles.length });

    // Prefer ensure-via-get-or-create so first PUT after signup still works
    await getOrCreateProfile(userId, email);

    try {
      const profile = await updateTargetRoles(userId, targetRoles);
      return apiResponse.ok(profile);
    } catch (err) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
        throw new ResourceNotFoundError('User profile not found');
      }
      throw err;
    }
  } catch (err) {
    return sendErrorResponse(err, logger, 'Error on updateProfile');
  }
};

export const main = wrapper(updateProfile);
