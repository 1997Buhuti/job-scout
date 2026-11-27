#!/usr/bin/env node
/**
 * Manual trigger for the job-scout scheduler pipeline for a specific user.
 *
 * Usage: npx ts-node scripts/triggerJobScout.ts [email]
 * Example: npx ts-node scripts/triggerJobScout.ts dp.manakal82@gmail.com
 *
 * Runs the full pipeline:
 * - B5: Scrape jobs from all configured portals
 * - B6: Dedupe and omit already-evaluated jobs
 * - B7: Bedrock evaluation for new jobs
 * - B8: Send digest email with new matches
 * - B9: Advance schedule (update lastRunAt/nextRunAt)
 *
 * Requires AWS credentials with DynamoDB, Bedrock, and SES permissions.
 * Set AWS_PROFILE or run with appropriate IAM role.
 */
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';

import type { UserProfile } from '../src/modules/profileModule/getProfile/types';
import { runSchedulerPipelineForUser } from '../src/modules/schedulerModule/runUserPipeline/runSchedulerPipelineForUser';

const DEFAULT_TEST_USER_EMAIL = 'dp.manakal82@gmail.com';
const REGION = process.env.AWS_REGION || 'us-east-1';
const STAGE = process.env.STAGE || 'dev';
const AWS_PROFILE = process.env.AWS_PROFILE || 'dev-manakal';

// Set Lambda environment variables for local execution
// These are normally set by Serverless Framework in AWS
if (!process.env.JOBS_TABLE_NAME) {
  process.env.JOBS_TABLE_NAME = `job-scout-${STAGE}-jobs`;
}
if (!process.env.MATCHES_TABLE_NAME) {
  process.env.MATCHES_TABLE_NAME = `job-scout-${STAGE}-matches`;
}
if (!process.env.USERS_TABLE_NAME) {
  process.env.USERS_TABLE_NAME = `job-scout-${STAGE}-users`;
}

// SDK clients in the imported modules will use the default credential chain,
// which respects AWS_PROFILE from the environment.
const ddbClient = new DynamoDBClient({ region: REGION });

function resolveUsersTable(): string {
  // Match serverless.ts table naming: job-scout-${stage}-users
  return `job-scout-${STAGE}-users`;
}

async function findUserByEmail(email: string): Promise<UserProfile | null> {
  const tableName = resolveUsersTable();
  console.log(`Looking up user with email: ${email}`);
  console.log(`Table: ${tableName}`);

  const result = await ddbClient.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': { S: email },
      },
      Limit: 1,
    }),
  );

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  // Convert DynamoDB item to UserProfile
  const item = result.Items[0];
  return {
    userId: item.userId?.S || '',
    email: item.email?.S || '',
    targetRoles: (item.targetRoles?.L || []).map((r: { S: string }) => r.S).filter(Boolean),
    excludedKeywords: (item.excludedKeywords?.L || []).map((r: { S: string }) => r.S).filter(Boolean),
    workModes: (item.workModes?.L || []).map((r: { S: string }) => r.S).filter(Boolean) as UserProfile['workModes'],
    minMonthlySalaryLkr: item.minMonthlySalaryLkr?.N ? parseInt(item.minMonthlySalaryLkr.N, 10) : null,
    cvS3Key: item.cvS3Key?.S,
    scheduleIntervalDays: item.scheduleIntervalDays?.N ? parseInt(item.scheduleIntervalDays.N, 10) : 7,
    schedulerEnabled: item.schedulerEnabled?.BOOL ?? true,
    lastRunAt: item.lastRunAt?.S,
    nextRunAt: item.nextRunAt?.S,
    emailVerificationStatus: (item.emailVerificationStatus?.S as UserProfile['emailVerificationStatus']) || 'NOT_REQUESTED',
    emailSuppressed: item.emailSuppressed?.BOOL,
    emailSuppressedReason: item.emailSuppressedReason?.S as UserProfile['emailSuppressedReason'],
    emailSuppressedAt: item.emailSuppressedAt?.S,
    createdAt: item.createdAt?.S || new Date().toISOString(),
    updatedAt: item.updatedAt?.S || new Date().toISOString(),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const email = args[0] || DEFAULT_TEST_USER_EMAIL;

  console.log('='.repeat(60));
  console.log('Job Scout - Manual Pipeline Trigger');
  console.log('='.repeat(60));
  console.log(`Stage: ${STAGE}`);
  console.log(`Region: ${REGION}`);
  console.log(`AWS Profile: ${AWS_PROFILE}`);
  console.log(`Test User Email: ${email}`);
  console.log('');

  try {
    // Find the user
    const user = await findUserByEmail(email);

    if (!user) {
      console.error(`❌ User not found with email: ${email}`);
      console.error('');
      console.error('Make sure:');
      console.error('1. The user exists in the DynamoDB users table');
      console.error('2. The STAGE environment variable matches your deployment (default: dev)');
      console.error('3. AWS credentials are configured correctly');
      process.exit(1);
    }

    console.log('✅ Found user:');
    console.log(`   User ID: ${user.userId}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Scheduler Enabled: ${user.schedulerEnabled}`);
    console.log(`   Target Roles: ${user.targetRoles.join(', ') || '(none)'}`);
    console.log(`   CV S3 Key: ${user.cvS3Key || '(not uploaded)'}`);
    console.log(`   Schedule Interval: ${user.scheduleIntervalDays} days`);
    console.log(`   Last Run: ${user.lastRunAt || '(never)'}`);
    console.log('');

    // Validation checks (same as dispatcher)
    if (!user.cvS3Key) {
      console.error('❌ User has no CV uploaded. Upload a CV first.');
      process.exit(1);
    }

    if (!user.targetRoles || user.targetRoles.length === 0) {
      console.error('❌ User has no target roles configured. Set target roles in the profile.');
      process.exit(1);
    }

    console.log('🚀 Starting scheduler pipeline...');
    console.log('');

    // Run the full pipeline
    const result = await runSchedulerPipelineForUser({
      userId: user.userId,
      email: user.email,
      targetRoles: user.targetRoles,
      scheduleIntervalDays: user.scheduleIntervalDays,
      schedulerEnabled: user.schedulerEnabled,
      emailSuppressed: user.emailSuppressed,
      emailVerificationStatus: user.emailVerificationStatus,
    });

    console.log('');
    console.log('='.repeat(60));
    console.log('Pipeline Complete!');
    console.log('='.repeat(60));
    console.log(`📊 Jobs Scraped: ${result.scraped}`);
    console.log(`📊 Jobs Evaluated: ${result.evaluated}`);
    console.log(`📧 Digest Status: ${result.digest.status}`);
    
    if (result.digest.status === 'sent') {
      console.log(`📧 Message ID: ${result.digest.messageId || 'N/A'}`);
      console.log(`📧 Match IDs sent: ${result.digest.matchIds.length}`);
    } else if (result.digest.status === 'skipped') {
      console.log(`📧 Skip Reason: ${result.digest.reason}`);
      console.log(`📧 Match IDs pending: ${result.digest.matchIds.length}`);
    } else if (result.digest.status === 'failed') {
      console.log(`📧 Error: ${result.digest.error}`);
      console.log(`📧 Failure Type: ${result.digest.reason}`);
    }
    
    console.log(`⏰ Last Run At: ${result.lastRunAt}`);
    console.log(`⏰ Next Run At: ${result.nextRunAt}`);
    console.log('');

    if (result.digest.status === 'sent') {
      console.log('✅ Check your inbox for the job digest email!');
    } else if (result.digest.status === 'skipped') {
      console.log('ℹ️  Digest was skipped (no new matches or email suppressed).');
    } else {
      console.log('⚠️  Digest delivery failed. Check the logs for details.');
    }

  } catch (error) {
    console.error('');
    console.error('❌ Pipeline failed with error:');
    console.error(error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
