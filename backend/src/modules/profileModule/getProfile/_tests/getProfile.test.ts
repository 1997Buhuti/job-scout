import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

import { BadRequestError } from '@common/ErrorTypes';
import { buildDefaultProfile, getProfile } from '@modules/profileModule/getProfile/getProfile';

const getMock = jest.fn();
const putMock = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn().mockReturnValue({ send: mockSend }),
  },
  GetCommand: jest.fn().mockImplementation((input) => ({ input, __type: 'GetCommand' })),
  PutCommand: jest.fn().mockImplementation((input) => ({ input, __type: 'PutCommand' })),
}));

function mockSend(command: unknown) {
  if ((command as { __type?: string }).__type === 'GetCommand') {
    return getMock(command);
  }
  if ((command as { __type?: string }).__type === 'PutCommand') {
    return putMock(command);
  }
  return Promise.resolve({});
}

jest.mocked(GetCommand);
jest.mocked(PutCommand);

const buildEvent = (
  sub: string,
  email: string,
): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    requestContext: {
      authorizer: { jwt: { claims: { sub, email } } },
    },
  }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

describe('getProfile', () => {
  const originalTable = process.env.USERS_TABLE_NAME;

  beforeEach(() => {
    process.env.USERS_TABLE_NAME = 'job-scout-dev-users';
    getMock.mockReset();
    putMock.mockReset();
  });

  afterAll(() => {
    if (originalTable === undefined) {
      delete process.env.USERS_TABLE_NAME;
    } else {
      process.env.USERS_TABLE_NAME = originalTable;
    }
  });

  it('returns existing profile on GetItem hit (AC-2)', async () => {
    const existingProfile = {
      userId: 'sub-123',
      email: 'user@example.com',
      targetRoles: ['Engineer'],
      scheduleIntervalDays: 7,
      schedulerEnabled: false,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
    };
    getMock.mockResolvedValue({ Item: existingProfile });

    const result = await getProfile(buildEvent('sub-123', 'user@example.com'));

    expect(result).toEqual(existingProfile);
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(putMock).not.toHaveBeenCalled();
  });

  it('creates profile with defaults on first call (AC-3)', async () => {
    getMock.mockResolvedValueOnce({ Item: undefined });
    putMock.mockResolvedValueOnce({});

    const result = await getProfile(buildEvent('sub-123', 'user@example.com'));

    expect(result).toMatchObject({
      userId: 'sub-123',
      email: 'user@example.com',
      targetRoles: [],
      scheduleIntervalDays: 7,
      schedulerEnabled: false,
    });
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock.mock.calls[0][0].input).toMatchObject({
      TableName: 'job-scout-dev-users',
      Item: expect.objectContaining({
        userId: 'sub-123',
        email: 'user@example.com',
      }),
      ConditionExpression: 'attribute_not_exists(userId)',
    });
  });

  it('handles race condition where another Lambda creates the profile first', async () => {
    getMock.mockResolvedValueOnce({ Item: undefined });

    const conditionalErr = new Error('Conditional check failed');
    Object.assign(conditionalErr, { name: 'ConditionalCheckFailedException', $metadata: {} });

    putMock
      .mockRejectedValueOnce(conditionalErr)
      .mockResolvedValueOnce({}); // Put returns but we fall through to Get

    getMock.mockResolvedValueOnce({
      Item: {
        userId: 'sub-123',
        email: 'user@example.com',
        targetRoles: ['Existing'],
        scheduleIntervalDays: 7,
        schedulerEnabled: false,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    });

    const result = await getProfile(buildEvent('sub-123', 'user@example.com'));

    expect(result).toMatchObject({ userId: 'sub-123', targetRoles: ['Existing'] });
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(putMock).toHaveBeenCalledTimes(1);
  });

  it('throws BadRequestError when sub claim is missing', async () => {
    const event = ({
      requestContext: { authorizer: { jwt: { claims: {} } } },
    }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

    await expect(getProfile(event)).rejects.toThrow(BadRequestError);
  });

  it('throws DatabaseError when USERS_TABLE_NAME is not set', async () => {
    delete process.env.USERS_TABLE_NAME;

    await expect(getProfile(buildEvent('sub-123', 'user@example.com'))).rejects.toThrow(
      'Missing required environment variable USERS_TABLE_NAME',
    );
  });
});

describe('buildDefaultProfile', () => {
  it('produces correct default shape', () => {
    const profile = buildDefaultProfile('sub-456', 'test@example.com');

    expect(profile).toMatchObject({
      userId: 'sub-456',
      email: 'test@example.com',
      targetRoles: [],
      scheduleIntervalDays: 7,
      schedulerEnabled: false,
    });
    expect(profile.targetRoles).not.toBe(PROFILE_DEFAULTS.targetRoles);
  });
});

const PROFILE_DEFAULTS = { targetRoles: [], scheduleIntervalDays: 7, schedulerEnabled: false };
