import { BadRequestError } from '@common/ErrorTypes';

import { PDF_CONTENT_TYPE } from './constants';

/**
 * Resolves the content type to sign into the presigned PUT.
 * An absent content type defaults to PDF; anything else is rejected (AC-6).
 */
export const validateCvContentType = (contentType: string | undefined): string => {
  if (contentType === undefined) {
    return PDF_CONTENT_TYPE;
  }

  const normalized = contentType.split(';')[0].trim().toLowerCase();
  if (normalized !== PDF_CONTENT_TYPE) {
    throw new BadRequestError(`Unsupported content type "${contentType}". Only ${PDF_CONTENT_TYPE} is allowed.`);
  }

  return PDF_CONTENT_TYPE;
};