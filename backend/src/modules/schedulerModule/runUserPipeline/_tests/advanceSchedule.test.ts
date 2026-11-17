import { advanceUserSchedule } from '@modules/schedulerModule/runUserPipeline/advanceSchedule';

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockImplementation(() => ({ send: mockSend })) },
  UpdateCommand: jest.fn().mockImplementation((input) => input),
}));

// Function declaration (not const) so it's hoisted and available when the
// jest.mock factory above runs during module resolution.
function mockSend(command: unknown) {
  return sendMock(command);
}

describe('advanceUserSchedule', () => {
  const originalUsersTable = process.env.USERS_TABLE_NAME;

  beforeEach(() => {
    process.env.USERS_TABLE_NAME = 'job-scout-dev-users';
    sendMock.mockReset();
    sendMock.mockResolvedValue({});
  });

  afterAll(() => {
    if (originalUsersTable === undefined) {
      delete process.env.USERS_TABLE_NAME;
    } else {
      process.env.USERS_TABLE_NAME = originalUsersTable;
    }
  });

  it.each([
    [1, '2025-01-15T20:00:00.000Z', '2025-01-16T18:30:00.000Z'], // Thu 01:30 IST -> Fri 17 Jan 00:00 IST
    [7, '2025-01-15T20:00:00.000Z', '2025-01-19T18:30:00.000Z'], // Thu 01:30 IST -> Mon 20 Jan 00:00 IST
    [30, '2025-01-15T20:00:00.000Z', '2025-01-31T18:30:00.000Z'], // -> 1 Feb 00:00 IST
  ])('sets nextRunAt for interval %d to the next IST boundary', async (days, now, expected) => {
    jest.useFakeTimers().setSystemTime(new Date(now));
    try {
      const result = await advanceUserSchedule('user-1', days);
      expect(result.nextRunAt).toBe(expected);
    } finally {
      jest.useRealTimers();
    }
  });

  it('refreshes gsi1sk to NEXT#{nextRunAt} and sets lastRunAt/updatedAt', async () => {
    const result = await advanceUserSchedule('user-1', 7);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0][0] as {
      TableName: string;
      Key: Record<string, unknown>;
      ExpressionAttributeValues: Record<string, unknown>;
    };
    expect(sent.TableName).toBe('job-scout-dev-users');
    expect(sent.Key).toEqual({ userId: 'user-1' });
    expect(sent.ExpressionAttributeValues[':lastRunAt']).toBe(result.lastRunAt);
    expect(sent.ExpressionAttributeValues[':nextRunAt']).toBe(result.nextRunAt);
    expect(sent.ExpressionAttributeValues[':updatedAt']).toBe(result.lastRunAt);
    expect(sent.ExpressionAttributeValues[':gsi1sk']).toBe(`NEXT#${result.nextRunAt}`);
  });
});
