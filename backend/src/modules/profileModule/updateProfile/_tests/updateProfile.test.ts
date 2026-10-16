import type { APIGatewayProxyEventV2 } from 'aws-lambda';

import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { BadRequestError } from '@common/ErrorTypes';
import { validateTargetRoles, updateProfile } from '@modules/profileModule/updateProfile/updateProfile';

const updateMock = jest.fn();
const getMock = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn().mockReturnValue({ send: mockSend }),
  },
  GetCommand: jest.fn().mockImplementation((input) => ({ input, __type: 'GetCommand' })),
  UpdateCommand: jest.fn().mockImplementation((input) => ({ input, __type: 'UpdateCommand' })),
}));

function mockSend(command: unknown) {
  const cmd = command as { __type?: string };
  if (cmd.__type === 'UpdateCommand') {
    return updateMock(command);
  }
  if (cmd.__type === 'GetCommand') {
    return getMock(command);
  }
  return Promise.resolve({});
}

jest.mocked(UpdateCommand);
jest.mocked(GetCommand);

const buildEvent = (sub: string, body?: object): APIGatewayProxyEventV2 =>
  ({
    requestContext: {
      authorizer: { jwt: { claims: { sub, email: 'user@example.com' } } },
    },
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as APIGatewayProxyEventV2;

describe('validateTargetRoles', () => {
  it('accepts valid roles', () => {
    const result = validateTargetRoles(['Engineer', 'Manager']);
    expect(result).toEqual(['Engineer', 'Manager']);
  });

  it('trims whitespace from roles', () => {
    const result = validateTargetRoles(['  Engineer  ', ' Manager ']);
    expect(result).toEqual(['Engineer', 'Manager']);
  });

  it('rejects non-string entries', () => {
    expect(() => validateTargetRoles(['Engineer', 123])).toThrow(BadRequestError);
    expect(() => validateTargetRoles(['Engineer', null])).toThrow(BadRequestError);
  });

  it('rejects empty string after trim', () => {
    expect(() => validateTargetRoles(['Engineer', '   '])).toThrow(BadRequestError);
  });

  it('rejects more than 10 roles', () => {
    const roles = Array.from({ length: 11 }, (_, i) => `Role${i}`);
    expect(() => validateTargetRoles(roles)).toThrow(BadRequestError);
  });

  it('rejects roles longer than 80 chars', () => {
    const longRole = 'a'.repeat(81);
    expect(() => validateTargetRoles([longRole])).toThrow(BadRequestError);
  });

  it('rejects non-array input', () => {
    expect(() => validateTargetRoles('not-an-array')).toThrow(BadRequestError);
    expect(() => validateTargetRoles({ roles: [] })).toThrow(BadRequestError);
  });

  it('accepts empty array', () => {
    expect(validateTargetRoles([])).toEqual([]);
  });

  it('accepts exactly 10 roles', () => {
    const roles = Array.from({ length: 10 }, (_, i) => `Role${i}`);
    expect(validateTargetRoles(roles)).toHaveLength(10);
  });

  it('accepts role of exactly 80 chars', () => {
    const role = 'a'.repeat(80);
    expect(validateTargetRoles([role])).toEqual([role]);
  });
});

describe('updateProfile', () => {
  const originalTable = process.env.USERS_TABLE_NAME;

  beforeEach(() => {
    process.env.USERS_TABLE_NAME = 'job-scout-dev-users';
    updateMock.mockReset();
    getMock.mockReset();
  });

  afterAll(() => {
    if (originalTable === undefined) {
      delete process.env.USERS_TABLE_NAME;
    } else {
      process.env.USERS_TABLE_NAME = originalTable;
    }
  });

  it('updates targetRoles and returns updated profile (AC-5)', async () => {
    const updatedProfile = {
      userId: 'sub-123',
      email: 'user@example.com',
      targetRoles: ['Engineer', 'Manager'],
      scheduleIntervalDays: 7,
      schedulerEnabled: false,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-14T00:00:00.000Z',
    };
    updateMock.mockResolvedValue({ Attributes: updatedProfile });

    const result = await updateProfile(buildEvent('sub-123', { targetRoles: ['Engineer', 'Manager'] }));

    expect(result).toEqual(updatedProfile);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0].input).toMatchObject({
      TableName: 'job-scout-dev-users',
      Key: { userId: 'sub-123' },
      UpdateExpression: 'SET updatedAt = :updatedAt, targetRoles = :targetRoles',
      ReturnValues: 'ALL_NEW',
    });
  });

  it('rejects invalid targetRoles (AC-6)', async () => {
    const longRole = 'a'.repeat(81);
    const event = buildEvent('sub-123', { targetRoles: [longRole] });

    await expect(updateProfile(event)).rejects.toThrow(BadRequestError);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('handles update without body (only sets updatedAt)', async () => {
    const updatedProfile = {
      userId: 'sub-123',
      email: 'user@example.com',
      targetRoles: [],
      scheduleIntervalDays: 7,
      schedulerEnabled: false,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-14T00:00:00.000Z',
    };
    updateMock.mockResolvedValue({ Attributes: updatedProfile });

    const result = await updateProfile(buildEvent('sub-123'));

    expect(result).toEqual(updatedProfile);
    expect(updateMock.mock.calls[0][0].input.UpdateExpression).toBe('SET updatedAt = :updatedAt');
  });
});
