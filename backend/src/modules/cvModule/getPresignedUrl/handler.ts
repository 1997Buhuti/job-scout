import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';

import { apiResponse } from '@common/apiResponse';
import { CV_PRESIGN_SERVICE } from '@common/constants';
import { sendErrorResponse } from '@common/ErrorTypes';
import { Logger } from '@common/logger';
import wrapper from '@common/middyWrapper';

import { parsePresignCvRequest } from './parsePresignCvRequest';
import { presignCvUpload } from './presignCvUpload';
import { resolveCallerId } from './resolveCallerId';

const presignCvEndpoint = async (event: APIGatewayProxyEventV2, context: Context) => {
  const logger = new Logger(CV_PRESIGN_SERVICE, context.awsRequestId);

  try {
    const userId = resolveCallerId(event);
    const { contentType } = parsePresignCvRequest(event.body);
    const upload = await presignCvUpload({ userId, contentType });

    logger.info({ message: 'Issued presigned CV upload URL', data: { key: upload.key } });
    return apiResponse.ok(upload);
  } catch (err) {
    return sendErrorResponse(err, logger, 'Error issuing presigned CV upload URL');
  }
};

export const main = wrapper<APIGatewayProxyEventV2>(presignCvEndpoint);