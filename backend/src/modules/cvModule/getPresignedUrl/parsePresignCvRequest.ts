import { BadRequestError } from '@common/ErrorTypes';

import { PresignCvRequest } from './types';

const toRequestBody = (rawBody: unknown): unknown => {
  if (typeof rawBody !== 'string') {
    return rawBody;
  }

  if (rawBody.trim() === '') {
    return undefined;
  }

  try {
    return JSON.parse(rawBody);
  } catch (err) {
    throw new BadRequestError('Request body must be valid JSON', err);
  }
};

/**
 * Reads the optional `{ contentType }` body.
 * Middy's JSON body parser may have already decoded it into an object,
 * so both shapes are accepted.
 */
export const parsePresignCvRequest = (rawBody: unknown): PresignCvRequest => {
  const parsed = toRequestBody(rawBody);

  if (parsed === undefined || parsed === null) {
    return {};
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BadRequestError('Request body must be a JSON object');
  }

  const { contentType } = parsed as PresignCvRequest;

  if (contentType !== undefined && typeof contentType !== 'string') {
    throw new BadRequestError('contentType must be a string');
  }

  return { contentType };
};