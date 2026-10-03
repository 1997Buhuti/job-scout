import type { APIGatewayProxyEventV2 } from 'aws-lambda';

import { parseCvPdf } from '@modules/cvModule/parseCvPdf/parseCvPdf';

const getObjectMock = jest.fn();
const updateItemMock = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: getObjectMock })),
  GetObjectCommand: jest.fn().mockImplementation((input) => input),
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({ send: updateItemMock })),
  UpdateItemCommand: jest.fn().mockImplementation((input) => input),
}));

const buildEvent = (sub: string, key: string): APIGatewayProxyEventV2 =>
  ({
    requestContext: { authorizer: { jwt: { claims: { sub } } } },
    body: JSON.stringify({ key }),
  }) as unknown as APIGatewayProxyEventV2;

describe('parseCvPdf', () => {
  const originalBucket = process.env.CV_BUCKET_NAME;
  const originalUsersTable = process.env.USERS_TABLE_NAME;

  beforeEach(() => {
    process.env.CV_BUCKET_NAME = 'job-scout-dev-cvs';
    process.env.USERS_TABLE_NAME = 'job-scout-dev-users';
    getObjectMock.mockReset();
    updateItemMock.mockReset();
  });

  afterAll(() => {
    if (originalBucket === undefined) {
      delete process.env.CV_BUCKET_NAME;
    } else {
      process.env.CV_BUCKET_NAME = originalBucket;
    }

    if (originalUsersTable === undefined) {
      delete process.env.USERS_TABLE_NAME;
    } else {
      process.env.USERS_TABLE_NAME = originalUsersTable;
    }
  });

  it('rejects keys outside the authenticated user prefix', async () => {
    await expect(parseCvPdf({ event: buildEvent('user-123', 'cvs/other-user/abc.pdf') })).rejects.toThrow('must start with');

    expect(getObjectMock).not.toHaveBeenCalled();
  });

  it('reads the PDF, returns extracted text and updates the profile pointer', async () => {
    getObjectMock.mockResolvedValue({
      Body: Buffer.from('BT /F1 12 Tf 72 720 Td (Hello world) Tj ET'),
    });
    updateItemMock.mockResolvedValue({});

    const result = await parseCvPdf({ event: buildEvent('user-123', 'cvs/user-123/1712345678901.pdf') });

    expect(result).toEqual({
      key: 'cvs/user-123/1712345678901.pdf',
      text: 'Hello world',
      charCount: 11,
    });

    expect(getObjectMock).toHaveBeenCalledTimes(1);
    expect(getObjectMock.mock.calls[0][0]).toMatchObject({
      Bucket: 'job-scout-dev-cvs',
      Key: 'cvs/user-123/1712345678901.pdf',
    });
    expect(updateItemMock).toHaveBeenCalledTimes(1);
    expect(updateItemMock.mock.calls[0][0]).toMatchObject({
      TableName: 'job-scout-dev-users',
      Key: { userId: { S: 'user-123' } },
    });
  });
});
