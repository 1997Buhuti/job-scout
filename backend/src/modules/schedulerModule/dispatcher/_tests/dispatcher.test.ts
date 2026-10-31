import { dispatchDueUsers } from '@modules/schedulerModule/dispatcher/dispatcher';
import type { UserProfile } from '@modules/profileModule/getProfile/types';

const buildUser = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  userId: 'user-1',
  email: 'user@example.com',
  targetRoles: ['Software Engineer'],
  excludedKeywords: [],
  workModes: ['remote', 'hybrid'],
  minMonthlySalaryLkr: null,
  cvS3Key: 'cvs/user-1/cv.pdf',
  scheduleIntervalDays: 7,
  schedulerEnabled: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('dispatchDueUsers', () => {
  it('processes a due user with a CV and target roles', async () => {
    const user = buildUser();
    const queryDueUsers = jest.fn().mockResolvedValue([user]);
    const runPipelineForUser = jest.fn().mockResolvedValue(undefined);

    const result = await dispatchDueUsers({ queryDueUsers, runPipelineForUser });

    expect(runPipelineForUser).toHaveBeenCalledWith(user);
    expect(result).toEqual({ dueCount: 1, processed: [user.userId], skipped: [], failed: [] });
  });

  it('skips a user missing cvS3Key', async () => {
    const user = buildUser({ cvS3Key: undefined });
    const queryDueUsers = jest.fn().mockResolvedValue([user]);
    const runPipelineForUser = jest.fn().mockResolvedValue(undefined);

    const result = await dispatchDueUsers({ queryDueUsers, runPipelineForUser });

    expect(runPipelineForUser).not.toHaveBeenCalled();
    expect(result).toEqual({ dueCount: 1, processed: [], skipped: [user.userId], failed: [] });
  });

  it('skips a user with empty targetRoles', async () => {
    const user = buildUser({ targetRoles: [] });
    const queryDueUsers = jest.fn().mockResolvedValue([user]);
    const runPipelineForUser = jest.fn().mockResolvedValue(undefined);

    const result = await dispatchDueUsers({ queryDueUsers, runPipelineForUser });

    expect(runPipelineForUser).not.toHaveBeenCalled();
    expect(result).toEqual({ dueCount: 1, processed: [], skipped: [user.userId], failed: [] });
  });

  it("does not let one user's thrown error prevent the next user from being processed", async () => {
    const failingUser = buildUser({ userId: 'user-fail' });
    const okUser = buildUser({ userId: 'user-ok' });
    const queryDueUsers = jest.fn().mockResolvedValue([failingUser, okUser]);
    const runPipelineForUser = jest.fn(async (user: UserProfile) => {
      if (user.userId === 'user-fail') {
        throw new Error('boom');
      }
    });

    const result = await dispatchDueUsers({ queryDueUsers, runPipelineForUser });

    expect(runPipelineForUser).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      dueCount: 2,
      processed: ['user-ok'],
      skipped: [],
      failed: ['user-fail'],
    });
  });
});
