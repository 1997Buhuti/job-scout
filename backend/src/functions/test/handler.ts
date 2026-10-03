import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';

import { apiResponse } from '@common/apiResponse';
import { TEST_SERVICE } from '@common/constants';
import { sendErrorResponse } from '@common/ErrorTypes';
import { Logger } from '@common/logger';
import wrapper from '@common/middyWrapper';

const testEndpoint = async (event: APIGatewayProxyEventV2, context: Context) => {
  const logger = new Logger(TEST_SERVICE, context.awsRequestId);

  try {
    switch (event.requestContext.http.method) {
      case 'GET':
        logger.info({ message: 'Test endpoint invoked' });
        return apiResponse.ok({
          message: 'Successfully called test endpoint',
          stage: process.env.STAGE ?? 'unknown',
          runtime: process.version,
        });
      default:
        return apiResponse.notFound(`Method ${event.requestContext.http.method} not found`);
    }
  } catch (err) {
    return sendErrorResponse(err, logger, 'Error on test endpoint');
  }
};

export const main = wrapper<APIGatewayProxyEventV2>(testEndpoint);
