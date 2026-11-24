import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

import { BadRequestError } from '@common/ErrorTypes';
import type { Logger } from '@common/logger';
import { requestRecipientVerification } from '@modules/emailModule/recipientStatus';
import { buildDefaultProfile, getProfile } from '@modules/profileModule/getProfile/getProfile';

const getMock = jest.fn();
const putMock = jest.fn();
const updateMock = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn().mockReturnValue({ send: mockSend }),
  },
  GetCommand: jest.fn().mockImplementation((input) => ({ input, __type: 'GetCommand' })),
  PutCommand: jest.fn().mockImplementation((input) => ({ input, __type: 'PutCommand' })),
  UpdateCommand: jest
    .fn()
    .mockImplementation((input) => ({ input, __type: 'UpdateCommand' })),
}));

jest.mock('@modules/emailModule/recipientStatus', () => ({
  requestRecipientVerification: jest.fn(),
}));

function mockSend(command: unknown) {
  const type = (command as { __type?: string }).__type;
  if (type === 'GetCommand') {
    return getMock(command);
  }
  if (type === 'PutCommand') {
    return putMock(command);
  }
  if (type === 'UpdateCommand') {
    return updateMock(command);
  }
  return Promise.resolve({});
}

const requestVerificationMock = jest.mocked(requestRecipientVerification);

const buildLogger = () =>
  ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }) as unknown as Logger & {
    info: jest.Mock;
    warn: jest.Mock;
  };

const buildEvent = (
  sub: string,
  email: string,
): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    requestContext: {
      authorizer: { jwt: { claims: { sub, email } } },
    },
  }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

const storedProfile = (overrides: Record<string, unknown> = {}) => ({
  userId: 'sub-123',
  email: 'user@example.com',
  targetRoles: ['Engineer'],
  scheduleIntervalDays: 7,
  schedulerEnabled: false,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-02T00:00:00.000Z',
  ...overrides,
});

const updateInputs = () =>
  updateMock.mock.calls.map(([command]) => command.input);

describe('getProfile', () => {
  const originalTable = process.env.USERS_TABLE_NAME;

  beforeEach(() => {
    process.env.USERS_TABLE_NAME = 'job-scout-dev-users';
    getMock.mockReset();
    putMock.mockReset();
    updateMock.mockReset().mockResolvedValue({});
    // Sandbox off by default: requestRecipientVerification is a no-op.
    requestVerificationMock.mockReset().mockResolvedValue(null);
  });

  afterAll(() => {
    if (originalTable === undefined) {
      delete process.env.USERS_TABLE_NAME;
    } else {
      process.env.USERS_TABLE_NAME = originalTable;
    }
  });

  it('returns existing profile on GetItem hit (AC-2)', async () => {
    const existingProfile = storedProfile();
    getMock.mockResolvedValue({ Item: existingProfile });

    const result = await getProfile(buildEvent('sub-123', 'user@example.com'));

    expect(result).toMatchObject(existingProfile);
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(putMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
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
      emailVerificationStatus: 'NOT_REQUESTED',
      emailSuppressed: false,
    });
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock.mock.calls[0][0].input).toMatchObject({
      TableName: 'job-scout-dev-users',
      Item: expect.objectContaining({
        userId: 'sub-123',
        email: 'user@example.com',
        emailVerificationStatus: 'NOT_REQUESTED',
        emailSuppressed: false,
      }),
      ConditionExpression: 'attribute_not_exists(userId)',
    });
  });

  it('handles race condition where another Lambda creates the profile first', async () => {
    getMock.mockResolvedValueOnce({ Item: undefined });

    const conditionalErr = new Error('Conditional check failed');
    Object.assign(conditionalErr, { name: 'ConditionalCheckFailedException', $metadata: {} });
    putMock.mockRejectedValueOnce(conditionalErr);

    getMock.mockResolvedValueOnce({
      Item: storedProfile({ targetRoles: ['Existing'] }),
    });

    const result = await getProfile(buildEvent('sub-123', 'user@example.com'));

    expect(result).toMatchObject({ userId: 'sub-123', targetRoles: ['Existing'] });
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(putMock).toHaveBeenCalledTimes(1);
  });

  it('returns defaults for an item without the new preference fields (AC-1)', async () => {
    getMock.mockResolvedValue({ Item: storedProfile() });

    const result = await getProfile(buildEvent('sub-123', 'user@example.com'));

    expect(result).toMatchObject({
      targetRoles: ['Engineer'],
      excludedKeywords: [],
      workModes: ['remote', 'hybrid'],
      minMonthlySalaryLkr: null,
      scheduleIntervalDays: 7,
      emailVerificationStatus: 'NOT_REQUESTED',
      emailSuppressed: false,
    });
  });

  it('keeps stored preference values instead of defaults', async () => {
    getMock.mockResolvedValue({
      Item: storedProfile({
        targetRoles: [],
        excludedKeywords: ['intern'],
        workModes: ['onsite'],
        minMonthlySalaryLkr: null,
        scheduleIntervalDays: 30,
        schedulerEnabled: true,
        emailVerificationStatus: 'VERIFIED',
        emailSuppressed: true,
      }),
    });

    const result = await getProfile(buildEvent('sub-123', 'user@example.com'));

    expect(result).toMatchObject({
      excludedKeywords: ['intern'],
      workModes: ['onsite'],
      minMonthlySalaryLkr: null,
      scheduleIntervalDays: 30,
      emailVerificationStatus: 'VERIFIED',
      emailSuppressed: true,
    });
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

  describe('recipient verification (R4)', () => {
    it('requests verification on creation and stores PENDING (AC-5)', async () => {
      getMock.mockResolvedValueOnce({ Item: undefined });
      putMock.mockResolvedValueOnce({});
      requestVerificationMock.mockResolvedValueOnce('PENDING');

      const result = await getProfile(buildEvent('sub-123', 'user@example.com'));

      expect(requestVerificationMock).toHaveBeenCalledWith('user@example.com');
      expect(result.emailVerificationStatus).toBe('PENDING');
      expect(updateInputs()).toEqual([
        expect.objectContaining({
          TableName: 'job-scout-dev-users',
          Key: { userId: 'sub-123' },
          UpdateExpression: 'SET emailVerificationStatus = :status',
          ConditionExpression: 'email = :email',
          ExpressionAttributeValues: {
            ':status': 'PENDING',
            ':email': 'user@example.com',
          },
        }),
      ]);
    });

    it('stores VERIFIED when SES already has the address verified', async () => {
      getMock.mockResolvedValueOnce({ Item: undefined });
      putMock.mockResolvedValueOnce({});
      requestVerificationMock.mockResolvedValueOnce('VERIFIED');

      const result = await getProfile(buildEvent('sub-123', 'user@example.com'));

      expect(result.emailVerificationStatus).toBe('VERIFIED');
      expect(updateInputs()[0].ExpressionAttributeValues[':status']).toBe('VERIFIED');
    });

    it('makes no status write when sandbox mode is off (AC-7)', async () => {
      getMock.mockResolvedValueOnce({ Item: undefined });
      putMock.mockResolvedValueOnce({});

      const result = await getProfile(buildEvent('sub-123', 'user@example.com'));

      expect(result.emailVerificationStatus).toBe('NOT_REQUESTED');
      expect(updateMock).not.toHaveBeenCalled();
    });

    it('logs an SES failure and still returns the new profile', async () => {
      getMock.mockResolvedValueOnce({ Item: undefined });
      putMock.mockResolvedValueOnce({});
      requestVerificationMock.mockRejectedValueOnce(new Error('Throttling'));
      const logger = buildLogger();

      const result = await getProfile(buildEvent('sub-123', 'user@example.com'), logger);

      expect(result).toMatchObject({
        userId: 'sub-123',
        emailVerificationStatus: 'NOT_REQUESTED',
      });
      expect(updateMock).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { userId: 'sub-123' },
          error: { name: 'Error', message: 'Throttling' },
        }),
      );
    });

    it('logs a failed status write and still returns the profile', async () => {
      getMock.mockResolvedValueOnce({ Item: undefined });
      putMock.mockResolvedValueOnce({});
      requestVerificationMock.mockResolvedValueOnce('PENDING');
      updateMock.mockRejectedValueOnce(new Error('DynamoDB unavailable'));
      const logger = buildLogger();

      const result = await getProfile(buildEvent('sub-123', 'user@example.com'), logger);

      expect(result.emailVerificationStatus).toBe('NOT_REQUESTED');
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('retries the request on the next read of a NOT_REQUESTED profile', async () => {
      getMock.mockResolvedValueOnce({
        Item: storedProfile({ emailVerificationStatus: 'NOT_REQUESTED' }),
      });
      requestVerificationMock.mockResolvedValueOnce('PENDING');

      const result = await getProfile(buildEvent('sub-123', 'user@example.com'));

      expect(putMock).not.toHaveBeenCalled();
      expect(requestVerificationMock).toHaveBeenCalledWith('user@example.com');
      expect(result.emailVerificationStatus).toBe('PENDING');
    });

    it.each(['PENDING', 'VERIFIED'])(
      'does not request again when the status is %s',
      async (status) => {
        getMock.mockResolvedValueOnce({
          Item: storedProfile({ emailVerificationStatus: status }),
        });

        const result = await getProfile(buildEvent('sub-123', 'user@example.com'));

        expect(requestVerificationMock).not.toHaveBeenCalled();
        expect(updateMock).not.toHaveBeenCalled();
        expect(result.emailVerificationStatus).toBe(status);
      },
    );
  });

  describe('email backfill (R5, FR-8)', () => {
    it('leaves an unchanged email alone', async () => {
      getMock.mockResolvedValueOnce({
        Item: storedProfile({
          emailVerificationStatus: 'VERIFIED',
          emailSuppressed: true,
          emailSuppressedReason: 'BOUNCE',
          emailSuppressedAt: '2025-01-03T00:00:00.000Z',
        }),
      });

      const result = await getProfile(buildEvent('sub-123', 'user@example.com'));

      expect(updateMock).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        email: 'user@example.com',
        emailVerificationStatus: 'VERIFIED',
        emailSuppressed: true,
        emailSuppressedReason: 'BOUNCE',
      });
    });

    it('writes a changed email and resets verification and suppression', async () => {
      getMock.mockResolvedValueOnce({
        Item: storedProfile({
          email: 'old@example.com',
          emailVerificationStatus: 'VERIFIED',
          emailSuppressed: true,
          emailSuppressedReason: 'COMPLAINT',
          emailSuppressedAt: '2025-01-03T00:00:00.000Z',
        }),
      });

      const result = await getProfile(buildEvent('sub-123', 'new@example.com'));

      expect(updateInputs()[0]).toMatchObject({
        TableName: 'job-scout-dev-users',
        Key: { userId: 'sub-123' },
        UpdateExpression:
          'SET email = :email, emailVerificationStatus = :notRequested, ' +
          'emailSuppressed = :notSuppressed, updatedAt = :updatedAt ' +
          'REMOVE emailSuppressedReason, emailSuppressedAt',
        ConditionExpression: 'attribute_exists(userId)',
        ExpressionAttributeValues: expect.objectContaining({
          ':email': 'new@example.com',
          ':notRequested': 'NOT_REQUESTED',
          ':notSuppressed': false,
        }),
      });
      expect(result).toMatchObject({
        email: 'new@example.com',
        emailVerificationStatus: 'NOT_REQUESTED',
        emailSuppressed: false,
      });
      expect(result).not.toHaveProperty('emailSuppressedReason');
      expect(result).not.toHaveProperty('emailSuppressedAt');
      expect(result.updatedAt).not.toBe('2025-01-02T00:00:00.000Z');
    });

    it('requests verification for the new address after a change', async () => {
      getMock.mockResolvedValueOnce({
        Item: storedProfile({
          email: 'old@example.com',
          emailVerificationStatus: 'VERIFIED',
        }),
      });
      requestVerificationMock.mockResolvedValueOnce('PENDING');

      const result = await getProfile(buildEvent('sub-123', 'new@example.com'));

      expect(requestVerificationMock).toHaveBeenCalledWith('new@example.com');
      expect(updateInputs()[1]).toMatchObject({
        UpdateExpression: 'SET emailVerificationStatus = :status',
        ExpressionAttributeValues: {
          ':status': 'PENDING',
          ':email': 'new@example.com',
        },
      });
      expect(result.emailVerificationStatus).toBe('PENDING');
    });

    it('backfills a profile created before the email field existed (AC-14)', async () => {
      const legacy: Record<string, unknown> = storedProfile();
      delete legacy.email;
      getMock.mockResolvedValueOnce({ Item: legacy });

      const result = await getProfile(buildEvent('sub-123', 'user@example.com'));

      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(updateInputs()[0].ExpressionAttributeValues[':email']).toBe(
        'user@example.com',
      );
      expect(result).toMatchObject({
        userId: 'sub-123',
        email: 'user@example.com',
        targetRoles: ['Engineer'],
        emailVerificationStatus: 'NOT_REQUESTED',
        emailSuppressed: false,
      });
    });

    it('fails the request when the backfill write fails', async () => {
      getMock.mockResolvedValueOnce({
        Item: storedProfile({ email: 'old@example.com' }),
      });
      updateMock.mockRejectedValueOnce(new Error('DynamoDB unavailable'));

      await expect(
        getProfile(buildEvent('sub-123', 'new@example.com')),
      ).rejects.toThrow('DynamoDB unavailable');
      expect(requestVerificationMock).not.toHaveBeenCalled();
    });
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
      emailVerificationStatus: 'NOT_REQUESTED',
      emailSuppressed: false,
    });
    expect(profile.targetRoles).not.toBe(PROFILE_DEFAULTS.targetRoles);
  });
});

const PROFILE_DEFAULTS = { targetRoles: [], scheduleIntervalDays: 7, schedulerEnabled: false };
