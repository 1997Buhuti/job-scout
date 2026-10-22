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
    const result = await parseCvPdf({ event, logger });

    // B12: Include cvProfile in response
    logger.info({ 
      message: 'Parsed uploaded CV PDF', 
      data: { 
        key: result.key, 
        charCount: result.charCount, 
        hasCvProfile: !!result.cvProfile,
        skillsCount: result.cvProfile?.skills.length || 0,
      } 
    });
    return apiResponse.ok(result);
  } catch (err) {
    return sendErrorResponse(err, logger, 'Error parsing CV PDF');
  }
};

export const main = wrapper<APIGatewayProxyEventV2>(parseCvEndpoint);
