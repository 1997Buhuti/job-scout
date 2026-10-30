import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { BadRequestError } from '@common/ErrorTypes';
import {
  validateScheduleIntervalDays,
  validateSchedulerEnabled,
  updateSchedule,
} from '@modules/schedulerModule/updateSchedule/updateSchedule';

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

describe('validateScheduleIntervalDays', () => {
  it('accepts integers from 1 to 30 (AC-1)', () => {
    expect(validateScheduleIntervalDays(1)).toBe(1);
    expect(validateScheduleIntervalDays(7)).toBe(7);
    expect(validateScheduleIntervalDays(30)).toBe(30);
  });

  it('rejects 0 and 31 (AC-1)', () => {
    expect(() => validateScheduleIntervalDays(0)).toThrow(BadRequestError);
    expect(() => validateScheduleIntervalDays(31)).toThrow(BadRequestError);
  });

  it('rejects non-integers and non-numbers', () => {
    expect(() => validateScheduleIntervalDays(7.5)).toThrow(BadRequestError);
    expect(() => validateScheduleIntervalDays('7')).toThrow(BadRequestError);
    expect(() => validateScheduleIntervalDays(undefined)).toThrow(BadRequestError);
  });
});

describe('validateSchedulerEnabled', () => {
  it('accepts booleans', () => {
    expect(validateSchedulerEnabled(true)).toBe(true);
    expect(validateSchedulerEnabled(false)).toBe(false);
  });

  it('rejects non-booleans', () => {
    expect(() => validateSchedulerEnabled('true')).toThrow(BadRequestError);
    expect(() => validateSchedulerEnabled(1)).toThrow(BadRequestError);
    expect(() => validateSchedulerEnabled(undefined)).toThrow(BadRequestError);
  });
});

describe('updateSchedule', () => {
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

  it('persists a valid scheduleIntervalDays (AC-1)', async () => {
    updateMock.mockResolvedValue({
      Attributes: {
        userId: 'sub-123',
        email: 'user@example.com',
        scheduleIntervalDays: 14,
        schedulerEnabled: false,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-14T00:00:00.000Z',
      },
    });

    const result = await updateSchedule(buildEvent('sub-123', { scheduleIntervalDays: 14 }));

    expect(result).toMatchObject({ scheduleIntervalDays: 14 });
    expect(getMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0].input).toMatchObject({
      TableName: 'job-scout-dev-users',
      Key: { userId: 'sub-123' },
      UpdateExpression: 'SET updatedAt = :updatedAt, scheduleIntervalDays = :scheduleIntervalDays',
      ReturnValues: 'ALL_NEW',
    });
  });

  it('rejects scheduleIntervalDays of 0 (AC-1)', async () => {
    await expect(
      updateSchedule(buildEvent('sub-123', { scheduleIntervalDays: 0 })),
    ).rejects.toThrow(BadRequestError);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejects scheduleIntervalDays of 31 (AC-1)', async () => {
    await expect(
      updateSchedule(buildEvent('sub-123', { scheduleIntervalDays: 31 })),
    ).rejects.toThrow(BadRequestError);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('sets nextRunAt to now when enabling with no prior nextRunAt', async () => {
    getMock.mockResolvedValue({ Item: { userId: 'sub-123' } });
    updateMock.mockResolvedValue({
      Attributes: {
        userId: 'sub-123',
        email: 'user@example.com',
        scheduleIntervalDays: 7,
        schedulerEnabled: true,
        nextRunAt: '2025-01-14T00:00:00.000Z',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-14T00:00:00.000Z',
      },
    });

    await updateSchedule(buildEvent('sub-123', { schedulerEnabled: true }));

    expect(getMock).toHaveBeenCalledTimes(1);
    const input = updateMock.mock.calls[0][0].input;
    expect(input.UpdateExpression).toBe(
      'SET updatedAt = :updatedAt, schedulerEnabled = :schedulerEnabled, nextRunAt = :nextRunAt',
    );
    expect(input.ExpressionAttributeValues[':nextRunAt']).toEqual(expect.any(String));
  });

  it('leaves nextRunAt unchanged when enabling with an existing nextRunAt', async () => {
    getMock.mockResolvedValue({
      Item: { userId: 'sub-123', nextRunAt: '2025-02-01T00:00:00.000Z' },
    });
    updateMock.mockResolvedValue({
      Attributes: {
        userId: 'sub-123',
        email: 'user@example.com',
        scheduleIntervalDays: 7,
        schedulerEnabled: true,
        nextRunAt: '2025-02-01T00:00:00.000Z',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-14T00:00:00.000Z',
      },
    });

    const result = await updateSchedule(buildEvent('sub-123', { schedulerEnabled: true }));

    expect(getMock).toHaveBeenCalledTimes(1);
    const input = updateMock.mock.calls[0][0].input;
    expect(input.UpdateExpression).toBe(
      'SET updatedAt = :updatedAt, schedulerEnabled = :schedulerEnabled',
    );
    expect(input.ExpressionAttributeValues).not.toHaveProperty(':nextRunAt');
    expect(result.nextRunAt).toBe('2025-02-01T00:00:00.000Z');
  });

  it('does not look up nextRunAt when disabling the scheduler', async () => {
    updateMock.mockResolvedValue({
      Attributes: {
        userId: 'sub-123',
        email: 'user@example.com',
        scheduleIntervalDays: 7,
        schedulerEnabled: false,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-14T00:00:00.000Z',
      },
    });

    await updateSchedule(buildEvent('sub-123', { schedulerEnabled: false }));

    expect(getMock).not.toHaveBeenCalled();
    const input = updateMock.mock.calls[0][0].input;
    expect(input.UpdateExpression).toBe(
      'SET updatedAt = :updatedAt, schedulerEnabled = :schedulerEnabled',
    );
  });

  it('only updates schedulerEnabled when scheduleIntervalDays is absent (partial update)', async () => {
    updateMock.mockResolvedValue({
      Attributes: {
        userId: 'sub-123',
        email: 'user@example.com',
        scheduleIntervalDays: 7,
        schedulerEnabled: false,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-14T00:00:00.000Z',
      },
    });

    await updateSchedule(buildEvent('sub-123', { schedulerEnabled: false }));

    const input = updateMock.mock.calls[0][0].input;
    expect(input.UpdateExpression).not.toContain('scheduleIntervalDays');
    expect(input.ExpressionAttributeValues).not.toHaveProperty(':scheduleIntervalDays');
  });

  it('handles an empty body (only sets updatedAt)', async () => {
    updateMock.mockResolvedValue({
      Attributes: {
        userId: 'sub-123',
        email: 'user@example.com',
        scheduleIntervalDays: 7,
        schedulerEnabled: false,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-14T00:00:00.000Z',
      },
    });

    await updateSchedule(buildEvent('sub-123'));

    expect(updateMock.mock.calls[0][0].input.UpdateExpression).toBe('SET updatedAt = :updatedAt');
  });
});
