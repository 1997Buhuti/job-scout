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

  it.each([1, 7, 30])('sets nextRunAt exactly %d day(s) after lastRunAt', async (days) => {
    const result = await advanceUserSchedule('user-1', days);

    const expectedMs = Date.parse(result.lastRunAt) + days * 24 * 60 * 60 * 1000;
    expect(Date.parse(result.nextRunAt)).toBe(expectedMs);
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
