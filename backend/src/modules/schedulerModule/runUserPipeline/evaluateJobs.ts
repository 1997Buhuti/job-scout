import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

import { SCHEDULER_SERVICE } from '@common/constants';
import { DatabaseError } from '@common/ErrorTypes';
import { Logger } from '@common/logger';

import type { JobPosting, MatchResult } from './types';

const MATCHES_TABLE_ENV_KEY = 'MATCHES_TABLE_NAME';
/**
 * Locked per `specs/02-database-schema.md` §3 Bedrock constraints — do not
 * switch to amazon.nova-micro-v1:0 (reserved for the CV-structured-extract
 * feature).
 */
export const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID ?? 'anthropic.claude-3-haiku-20240307-v1:0';
const BEDROCK_MAX_TOKENS = 300;

const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });
const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(ddbClient);
const logger = new Logger(SCHEDULER_SERVICE);

const resolveMatchesTable = (): string => {
  const tableName = process.env[MATCHES_TABLE_ENV_KEY];
  if (!tableName) {
    throw new DatabaseError(`Missing required environment variable ${MATCHES_TABLE_ENV_KEY}`);
  }
  return tableName;
};

export interface BedrockEvaluation {
  matchScore: number;
  reasoning: string;
  matchingSkills: string[];
}

/** Injectable Bedrock call — returns the model's raw completion text. */
export type InvokeBedrockEvaluation = (
  job: JobPosting,
  targetRoles: string[],
) => Promise<string>;

const buildPrompt = (job: JobPosting, targetRoles: string[]): string =>
  'You are evaluating how well a job posting matches a job seeker\'s target roles.\n' +
  `Target roles: ${targetRoles.join(', ')}\n` +
  `Job title: ${job.title}\n` +
  `Job description: ${job.rawDescription}\n\n` +
  'Respond with ONLY a JSON object of the shape ' +
  '{"matchScore": number 0-100, "reasoning": string, "matchingSkills": string[]}.';

/** Default Bedrock call — see `scrapeJobs.ts`'s `FetchHtml` for the same injection pattern. */
export const invokeBedrockEvaluation: InvokeBedrockEvaluation = async (job, targetRoles) => {
  const response = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: BEDROCK_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: BEDROCK_MAX_TOKENS,
        messages: [{ role: 'user', content: buildPrompt(job, targetRoles) }],
      }),
    }),
  );

  const payload = JSON.parse(new TextDecoder().decode(response.body)) as {
    content?: Array<{ text?: string }>;
  };

  return payload.content?.[0]?.text ?? '';
};

/**
 * Defensively parses the model's completion text. Returns `null` (never
 * throws) when the text isn't valid JSON or is missing a required field,
 * so a malformed response just means the job is skipped.
 */
const parseEvaluation = (raw: string): BedrockEvaluation | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<BedrockEvaluation>;
    if (
      typeof parsed.matchScore !== 'number' ||
      typeof parsed.reasoning !== 'string' ||
      !Array.isArray(parsed.matchingSkills)
    ) {
      return null;
    }
    return {
      matchScore: parsed.matchScore,
      reasoning: parsed.reasoning,
      matchingSkills: parsed.matchingSkills.filter((skill): skill is string => typeof skill === 'string'),
    };
  } catch {
    return null;
  }
};

const defaultPutMatch = async (match: MatchResult): Promise<void> => {
  const tableName = resolveMatchesTable();
  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        ...match,
        PK: match.partitionKey,
        SK: 'MATCH',
        gsi1pk: `USER#${match.userId}`,
        gsi1sk: `SCORE#${match.matchScore}#${match.jobId}`,
      },
    }),
  );
};

export interface EvaluateJobsDeps {
  invokeBedrock?: InvokeBedrockEvaluation;
  putMatch?: (match: MatchResult) => Promise<void>;
}

/**
 * B7: evaluates each remaining (not-already-matched) job against the
 * user's target roles via Bedrock Haiku, persisting a `MatchResult` per
 * successfully-parsed evaluation. A malformed model response is skipped
 * and logged, never thrown, so one bad response doesn't fail the batch.
 */
export const evaluateJobsForUser = async (
  userId: string,
  targetRoles: string[],
  jobs: JobPosting[],
  deps: EvaluateJobsDeps = {},
): Promise<MatchResult[]> => {
  const invokeBedrock = deps.invokeBedrock ?? invokeBedrockEvaluation;
  const putMatch = deps.putMatch ?? defaultPutMatch;

  const results: MatchResult[] = [];

  for (const job of jobs) {
    const raw = await invokeBedrock(job, targetRoles);
    const evaluation = parseEvaluation(raw);

    if (!evaluation) {
      logger.warn({
        message: 'Skipping job: could not parse Bedrock evaluation response',
        data: { userId, jobId: job.jobId },
      });
      continue;
    }

    const match: MatchResult = {
      partitionKey: `${userId}#${job.jobId}`,
      userId,
      jobId: job.jobId,
      matchScore: evaluation.matchScore,
      reasoning: evaluation.reasoning,
      matchingSkills: evaluation.matchingSkills,
      evaluatedAt: new Date().toISOString(),
    };

    await putMatch(match);
    results.push(match);
  }

  return results;
};
