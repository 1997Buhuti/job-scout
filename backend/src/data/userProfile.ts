import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { DatabaseError } from '@common/ErrorTypes';
import { docClient, getUsersTableName } from '@data/dynamodb';

/** Inclusive user-configured scrape interval. Min daily (1), max monthly (30). */
export type ScheduleIntervalDays = number;

export interface UserProfile {
  userId: string;
  email: string;
  targetRoles: string[];
  cvS3Key?: string;
  scheduleIntervalDays: ScheduleIntervalDays;
  schedulerEnabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfileItem extends UserProfile {
  PK: string;
  SK: string;
}

export const PROFILE_SK = 'PROFILE';

export const userPk = (userId: string): string => `USER#${userId}`;

const DEFAULT_SCHEDULE_INTERVAL_DAYS = 7;

export const toPublicProfile = (item: UserProfileItem): UserProfile => {
  const profile: UserProfile = {
    userId: item.userId,
    email: item.email,
    targetRoles: item.targetRoles ?? [],
    scheduleIntervalDays: item.scheduleIntervalDays,
    schedulerEnabled: item.schedulerEnabled,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };

  if (item.cvS3Key) profile.cvS3Key = item.cvS3Key;
  if (item.lastRunAt) profile.lastRunAt = item.lastRunAt;
  if (item.nextRunAt) profile.nextRunAt = item.nextRunAt;

  return profile;
};

export const buildDefaultProfileItem = (userId: string, email: string, now = new Date().toISOString()): UserProfileItem => ({
  PK: userPk(userId),
  SK: PROFILE_SK,
  userId,
  email,
  targetRoles: [],
  scheduleIntervalDays: DEFAULT_SCHEDULE_INTERVAL_DAYS,
  schedulerEnabled: false,
  createdAt: now,
  updatedAt: now,
});

export const getProfileByUserId = async (userId: string): Promise<UserProfileItem | null> => {
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: getUsersTableName(),
        Key: {
          PK: userPk(userId),
          SK: PROFILE_SK,
        },
      }),
    );

    return (result.Item as UserProfileItem | undefined) ?? null;
  } catch (err) {
    throw new DatabaseError('Failed to get user profile', err);
  }
};

/**
 * Get existing profile or create with defaults (idempotent on first access).
 * Uses conditional Put to avoid overwriting if another request races.
 */
export const getOrCreateProfile = async (userId: string, email: string): Promise<UserProfile> => {
  const existing = await getProfileByUserId(userId);
  if (existing) {
    return toPublicProfile(existing);
  }

  const item = buildDefaultProfileItem(userId, email);

  try {
    await docClient.send(
      new PutCommand({
        TableName: getUsersTableName(),
        Item: item,
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
    return toPublicProfile(item);
  } catch (err) {
    // Concurrent create — re-read the winner
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      const raced = await getProfileByUserId(userId);
      if (raced) {
        return toPublicProfile(raced);
      }
    }
    throw new DatabaseError('Failed to create user profile', err);
  }
};

export const updateTargetRoles = async (userId: string, targetRoles: string[]): Promise<UserProfile> => {
  const updatedAt = new Date().toISOString();

  try {
    const result = await docClient.send(
      new UpdateCommand({
        TableName: getUsersTableName(),
        Key: {
          PK: userPk(userId),
          SK: PROFILE_SK,
        },
        UpdateExpression: 'SET targetRoles = :targetRoles, updatedAt = :updatedAt',
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeValues: {
          ':targetRoles': targetRoles,
          ':updatedAt': updatedAt,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );

    return toPublicProfile(result.Attributes as UserProfileItem);
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      throw err;
    }
    throw new DatabaseError('Failed to update user profile', err);
  }
};
