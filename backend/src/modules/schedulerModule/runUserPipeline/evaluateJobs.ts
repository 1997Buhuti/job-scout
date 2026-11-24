import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

import { SCHEDULER_SERVICE } from '@common/constants';
import {
  MAX_BEDROCK_DESCRIPTION_CHARS,
  MAX_BEDROCK_EVALUATIONS_PER_USER,
} from '@common/costLimits';
import { DatabaseError } from '@common/ErrorTypes';
import { Logger } from '@common/logger';

import { MAX_REASONING_CHARS, truncateReasoning } from './reasoning';
import type { JobPosting, MatchResult } from './types';

const MATCHES_TABLE_ENV_KEY = 'MATCHES_TABLE_NAME';
/**
 * Locked per `specs/02-database-schema.md` §3 Bedrock constraints — do not
 * switch to amazon.nova-micro-v1:0 (reserved for the CV-structured-extract
 * feature). The Converse API keeps the request shape identical across model
 * families, so moving to a larger model is a config change.
 */
export const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'amazon.nova-lite-v1:0';
/** Output-token cap from the scheduler spec. Unchanged by the shorter-reason prompt. */
export const BEDROCK_MAX_TOKENS = 300;

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

export const buildPrompt = (job: JobPosting, targetRoles: string[]): string =>
  'You are evaluating how well a job posting matches a job seeker\'s target roles.\n' +
  `Target roles: ${targetRoles.join(', ')}\n` +
  `Job title: ${job.title}\n` +
  `Job description: ${job.rawDescription.slice(0, MAX_BEDROCK_DESCRIPTION_CHARS)}\n\n` +
  'Respond with ONLY a JSON object of the shape ' +
  '{"matchScore": number 0-100, "reasoning": string, "matchingSkills": string[]}.\n' +
  `"reasoning" must be one or two plain sentences, at most ${MAX_REASONING_CHARS} characters, ` +
  'saying why the role fits or does not fit the target roles. ' +
  'Do not restate the score, and do not comment on the company name or the location.';

/** Default Bedrock call — see `scrapeJobs.ts`'s `FetchHtml` for the same injection pattern. */
export const invokeBedrockEvaluation: InvokeBedrockEvaluation = async (job, targetRoles) => {
  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: BEDROCK_MODEL_ID,
      messages: [{ role: 'user', content: [{ text: buildPrompt(job, targetRoles) }] }],
      inferenceConfig: { maxTokens: BEDROCK_MAX_TOKENS, temperature: 0 },
    }),
  );

  return (
    response.output?.message?.content
      ?.map((block) => block.text ?? '')
      .join('')
      .trim() ?? ''
  );
};

/**
 * Models often wrap JSON in a ```json fence or add a sentence around it.
 * Take the outermost {...} so those responses still parse.
 */
const extractJsonObject = (raw: string): string => {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  return start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
};

/**
 * Defensively parses the model's completion text. Returns `null` (never
 * throws) when the text isn't valid JSON or is missing a required field,
 * so a malformed response just means the job is skipped.
 */
const parseEvaluation = (raw: string): BedrockEvaluation | null => {
  try {
    const parsed = JSON.parse(extractJsonObject(raw)) as Partial<BedrockEvaluation>;
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

  // Cost guardrail: at most MAX_BEDROCK_EVALUATIONS_PER_USER Bedrock calls
  // per user per run. Unevaluated jobs are not saved, so the next run picks them up.
  const jobsToEvaluate = jobs.slice(0, MAX_BEDROCK_EVALUATIONS_PER_USER);
  if (jobs.length > jobsToEvaluate.length) {
    logger.warn({
      message: 'Bedrock evaluation cap reached; remaining jobs deferred to a later run',
      data: {
        userId,
        cap: MAX_BEDROCK_EVALUATIONS_PER_USER,
        candidates: jobs.length,
        deferred: jobs.length - jobsToEvaluate.length,
      },
    });
  }

  for (const job of jobsToEvaluate) {
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
      reasoning: truncateReasoning(evaluation.reasoning),
      matchingSkills: evaluation.matchingSkills,
      evaluatedAt: new Date().toISOString(),
    };

    await putMatch(match);
    results.push(match);
  }

  return results;
};
