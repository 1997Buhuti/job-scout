import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

import { apiResponse } from '@common/apiResponse';
import { TEST_SERVICE } from '@common/constants';
import { sendErrorResponse } from '@common/ErrorTypes';
import { Logger } from '@common/logger';
import wrapper from '@common/middyWrapper';

const testEndpoint = async (event: APIGatewayProxyEvent, context: Context) => {
  const logger = new Logger(TEST_SERVICE, context.awsRequestId);

  try {
    switch (event.httpMethod) {
      case 'GET':
        logger.info({ message: 'Test endpoint invoked' });
        return apiResponse.ok({
          message: 'Successfully called test endpoint',
          stage: process.env.STAGE ?? 'unknown',
          runtime: process.version,
        });
      default:
        return apiResponse.notFound(`Method ${event.httpMethod} not found`);
    }
  } catch (err) {
    return sendErrorResponse(err, logger, 'Error on test endpoint');
  }
};

export const main = wrapper(testEndpoint);
