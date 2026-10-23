import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';

import { apiResponse } from '@common/apiResponse';
import { CV_PRESIGN_SERVICE } from '@common/constants';
import { sendErrorResponse } from '@common/ErrorTypes';
import { Logger } from '@common/logger';
import wrapper from '@common/middyWrapper';

import { parseCvPdf } from './parseCvPdf';

const parseCvEndpoint = async (event: APIGatewayProxyEventV2, context: Context) => {
  const logger = new Logger(CV_PRESIGN_SERVICE, context.awsRequestId);

  try {
    await parseCvPdf({ event, logger });
    // The browser already has everything it sent; nothing to return.
    return apiResponse.noContent();
  } catch (err) {
    return sendErrorResponse(err, logger, 'Error saving CV');
  }
};

export const main = wrapper<APIGatewayProxyEventV2>(parseCvEndpoint);
