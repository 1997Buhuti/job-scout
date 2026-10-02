import type { APIGatewayProxyEventV2 } from 'aws-lambda';

import { parsePresignCvRequest } from '@modules/cvModule/getPresignedUrl/parsePresignCvRequest';
import { resolveCallerId } from '@modules/cvModule/getPresignedUrl/resolveCallerId';

const buildEvent = (body: unknown): APIGatewayProxyEventV2 =>
  ({
    body,
    requestContext: {
      authorizer: { jwt: { claims: { sub: 'sub-123' } } },
    },
  }) as unknown as APIGatewayProxyEventV2;

describe('resolveCallerId', () => {
  it('returns the Cognito sub claim', () => {
    expect(resolveCallerId(buildEvent(null))).toBe('sub-123');
  });

  it('rejects a request without an authorizer claim (AC-2)', () => {
    const event = { requestContext: {} } as unknown as APIGatewayProxyEventV2;

    expect(() => resolveCallerId(event)).toThrow('Missing authenticated Cognito identity');
  });
});

describe('parsePresignCvRequest', () => {
  it('returns an empty request when no body is sent', () => {
    expect(parsePresignCvRequest(null)).toEqual({});
    expect(parsePresignCvRequest(undefined)).toEqual({});
    expect(parsePresignCvRequest('')).toEqual({});
  });

  it('reads contentType from a raw JSON string body', () => {
    expect(parsePresignCvRequest('{"contentType":"application/pdf"}')).toEqual({ contentType: 'application/pdf' });
  });

  it('reads contentType from an already decoded body', () => {
    expect(parsePresignCvRequest({ contentType: 'application/pdf' })).toEqual({ contentType: 'application/pdf' });
  });

  it('rejects malformed JSON', () => {
    expect(() => parsePresignCvRequest('{not json')).toThrow('Request body must be valid JSON');
  });

  it('rejects a non-object body', () => {
    expect(() => parsePresignCvRequest('["application/pdf"]')).toThrow('Request body must be a JSON object');
  });

  it('rejects a non-string contentType', () => {
    expect(() => parsePresignCvRequest('{"contentType":42}')).toThrow('contentType must be a string');
  });
});