import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { BadRequestError } from '@common/ErrorTypes';
import {
  validateTargetRoles,
  validateExcludedKeywords,
  validateWorkModes,
  validateMinMonthlySalaryLkr,
  validateScheduleIntervalDays,
  updateProfile,
} from '@modules/profileModule/updateProfile/updateProfile';
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

const buildEvent = (
  sub: string,
  body?: object,
): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    requestContext: {
      authorizer: { jwt: { claims: { sub, email: 'user@example.com' } } },
    },
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

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

    expect(result).toMatchObject(updatedProfile);
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
    const updatedProfile: UserProfile = {
      userId: 'sub-123',
      email: 'user@example.com',
      targetRoles: [] as string[],
      excludedKeywords: [],
      workModes: ['remote', 'hybrid'],
      minMonthlySalaryLkr: null,
      scheduleIntervalDays: 7,
      schedulerEnabled: false,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-14T00:00:00.000Z',
    };
    updateMock.mockResolvedValue({ Attributes: updatedProfile });

    const result = await updateProfile(buildEvent('sub-123'));

    expect(result).toMatchObject(updatedProfile);
    expect(updateMock.mock.calls[0][0].input.UpdateExpression).toBe('SET updatedAt = :updatedAt');
  });

  it('updates cvProfile when provided', async () => {
    const mockCvProfile = {
      skills: ['TypeScript', 'AWS', 'Next.js'],
      experience: [{ title: 'Senior Engineer', company: 'Tech Corp' }],
      education: [{ institution: 'University' }],
      extractedAt: '2025-01-14T00:00:00.000Z',
      sourceCvS3Key: 'cvs/sub-123/test.pdf',
    };
    const updatedProfile: UserProfile = {
      userId: 'sub-123',
      email: 'user@example.com',
      targetRoles: [] as string[],
      excludedKeywords: [],
      workModes: ['remote', 'hybrid'],
      minMonthlySalaryLkr: null,
      cvS3Key: 'cvs/sub-123/test.pdf',
      cvProfile: mockCvProfile,
      scheduleIntervalDays: 7,
      schedulerEnabled: false,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-14T00:00:00.000Z',
    };
    updateMock.mockResolvedValue({ Attributes: updatedProfile });

    const result = await updateProfile(buildEvent('sub-123', { cvProfile: mockCvProfile }));

    expect(result).toMatchObject(updatedProfile);
    expect(updateMock.mock.calls[0][0].input.UpdateExpression).toBe('SET updatedAt = :updatedAt, cvProfile = :cvProfile');
  });

  it('rejects invalid cvProfile (not an object)', async () => {
    const event = buildEvent('sub-123', { cvProfile: 'not-an-object' });

    await expect(updateProfile(event)).rejects.toThrow(BadRequestError);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('updates both targetRoles and cvProfile together', async () => {
    const mockCvProfile = {
      skills: ['TypeScript', 'AWS'],
      experience: [],
      education: [],
      extractedAt: '2025-01-14T00:00:00.000Z',
      sourceCvS3Key: 'cvs/sub-123/test.pdf',
    };
    const updatedProfile = {
      userId: 'sub-123',
      email: 'user@example.com',
      targetRoles: ['Engineer'],
      cvS3Key: 'cvs/sub-123/test.pdf',
      cvProfile: mockCvProfile,
      scheduleIntervalDays: 7,
      schedulerEnabled: false,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-14T00:00:00.000Z',
    };
    updateMock.mockResolvedValue({ Attributes: updatedProfile });

    const result = await updateProfile(buildEvent('sub-123', { 
      targetRoles: ['Engineer'],
      cvProfile: mockCvProfile,
    }));

    expect(result).toMatchObject(updatedProfile);
    expect(updateMock.mock.calls[0][0].input.UpdateExpression).toBe('SET updatedAt = :updatedAt, targetRoles = :targetRoles, cvProfile = :cvProfile');
  });
});

describe('validateExcludedKeywords', () => {
  it('trims, lowercases, and deduplicates keywords (AC-2)', () => {
    expect(validateExcludedKeywords(['  Intern ', 'intern', 'JUNIOR'])).toEqual([
      'intern',
      'junior',
    ]);
  });

  it('accepts exactly 20 keywords', () => {
    const keywords = Array.from({ length: 20 }, (_, i) => `kw${i}`);
    expect(validateExcludedKeywords(keywords)).toHaveLength(20);
  });

  it('rejects more than 20 keywords (AC-3)', () => {
    const keywords = Array.from({ length: 21 }, (_, i) => `kw${i}`);
    expect(() => validateExcludedKeywords(keywords)).toThrow(BadRequestError);
  });

  it('accepts a keyword of exactly 40 characters', () => {
    const keyword = 'a'.repeat(40);
    expect(validateExcludedKeywords([keyword])).toEqual([keyword]);
  });

  it('rejects a keyword longer than 40 characters (AC-3)', () => {
    expect(() => validateExcludedKeywords(['a'.repeat(41)])).toThrow(BadRequestError);
  });

  it('rejects empty entries after trim', () => {
    expect(() => validateExcludedKeywords(['  '])).toThrow(BadRequestError);
  });

  it('rejects non-string entries and non-array input', () => {
    expect(() => validateExcludedKeywords(['ok', 3])).toThrow(BadRequestError);
    expect(() => validateExcludedKeywords('intern')).toThrow(BadRequestError);
  });
});

describe('validateWorkModes', () => {
  it('accepts known values', () => {
    expect(validateWorkModes(['remote', 'onsite'])).toEqual(['remote', 'onsite']);
  });

  it('rejects an empty array (AC-4)', () => {
    expect(() => validateWorkModes([])).toThrow(BadRequestError);
  });

  it('rejects unknown values (AC-4)', () => {
    expect(() => validateWorkModes(['remote', 'office'])).toThrow(BadRequestError);
    expect(() => validateWorkModes(['REMOTE'])).toThrow(BadRequestError);
  });

  it('rejects non-array input', () => {
    expect(() => validateWorkModes('remote')).toThrow(BadRequestError);
  });
});

describe('validateMinMonthlySalaryLkr', () => {
  it('accepts null to clear the value (AC-6)', () => {
    expect(validateMinMonthlySalaryLkr(null)).toBeNull();
  });

  it('accepts integers at both bounds (AC-6)', () => {
    expect(validateMinMonthlySalaryLkr(0)).toBe(0);
    expect(validateMinMonthlySalaryLkr(10_000_000)).toBe(10_000_000);
  });

  it('rejects values outside 0 to 10,000,000 (AC-6)', () => {
    expect(() => validateMinMonthlySalaryLkr(-1)).toThrow(BadRequestError);
    expect(() => validateMinMonthlySalaryLkr(10_000_001)).toThrow(BadRequestError);
  });

  it('rejects non-integers and non-numbers (AC-6)', () => {
    expect(() => validateMinMonthlySalaryLkr(50000.5)).toThrow(BadRequestError);
    expect(() => validateMinMonthlySalaryLkr('50000')).toThrow(BadRequestError);
    expect(() => validateMinMonthlySalaryLkr(undefined)).toThrow(BadRequestError);
  });
});

describe('validateScheduleIntervalDays', () => {
  it('accepts 1, 7, and 30 (AC-5)', () => {
    expect(validateScheduleIntervalDays(1)).toBe(1);
    expect(validateScheduleIntervalDays(7)).toBe(7);
    expect(validateScheduleIntervalDays(30)).toBe(30);
  });

  it('rejects any other value (AC-5)', () => {
    expect(() => validateScheduleIntervalDays(2)).toThrow(BadRequestError);
    expect(() => validateScheduleIntervalDays(31)).toThrow(BadRequestError);
    expect(() => validateScheduleIntervalDays('7')).toThrow(BadRequestError);
  });
});

describe('updateProfile partial updates', () => {
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

  it('sends only workModes in the update expression when only workModes is provided (AC-7)', async () => {
    updateMock.mockResolvedValue({
      Attributes: {
        userId: 'sub-123',
        email: 'user@example.com',
        targetRoles: ['Engineer'],
        workModes: ['onsite'],
        scheduleIntervalDays: 7,
        schedulerEnabled: false,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-14T00:00:00.000Z',
      },
    });

    const result = await updateProfile(buildEvent('sub-123', { workModes: ['onsite'] }));

    const input = updateMock.mock.calls[0][0].input;
    expect(input.UpdateExpression).toBe('SET updatedAt = :updatedAt, workModes = :workModes');
    expect(input.ExpressionAttributeValues).toEqual({
      ':updatedAt': expect.any(String),
      ':workModes': ['onsite'],
    });
    expect(result).toMatchObject({ workModes: ['onsite'], targetRoles: ['Engineer'] });
  });

  it('adds each new field to the update expression when present', async () => {
    updateMock.mockResolvedValue({ Attributes: { userId: 'sub-123', email: 'user@example.com' } });

    await updateProfile(
      buildEvent('sub-123', {
        excludedKeywords: [' Intern '],
        workModes: ['remote'],
        minMonthlySalaryLkr: null,
        scheduleIntervalDays: 30,
      }),
    );

    const input = updateMock.mock.calls[0][0].input;
    expect(input.UpdateExpression).toBe(
      'SET updatedAt = :updatedAt, excludedKeywords = :excludedKeywords, workModes = :workModes, minMonthlySalaryLkr = :minMonthlySalaryLkr, scheduleIntervalDays = :scheduleIntervalDays',
    );
    expect(input.ExpressionAttributeValues).toMatchObject({
      ':excludedKeywords': ['intern'],
      ':workModes': ['remote'],
      ':minMonthlySalaryLkr': null,
      ':scheduleIntervalDays': 30,
    });
  });

  it('does not write invalid preference values', async () => {
    await expect(
      updateProfile(buildEvent('sub-123', { workModes: [] })),
    ).rejects.toThrow(BadRequestError);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
