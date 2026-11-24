import {
  BEDROCK_MAX_TOKENS,
  buildPrompt,
  evaluateJobsForUser,
  invokeBedrockEvaluation,
} from '@modules/schedulerModule/runUserPipeline/evaluateJobs';
import { MAX_REASONING_CHARS } from '@modules/schedulerModule/runUserPipeline/reasoning';
import type { JobPosting } from '@modules/schedulerModule/runUserPipeline/types';

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockImplementation(() => ({ send: mockSend })) },
  PutCommand: jest.fn().mockImplementation((input) => input),
}));

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({ send: mockBedrockSend })),
  ConverseCommand: jest.fn().mockImplementation((input) => input),
}));

// Function declarations (not const) so they're hoisted and available when
// the jest.mock factories above run during module resolution.
function mockSend(command: unknown) {
  return sendMock(command);
}
function mockBedrockSend(command: unknown) {
  return bedrockSendMock(command);
}

const bedrockSendMock = jest.fn();

const job: JobPosting = {
  jobId: 'job-a',
  sourceSite: 'topjobs.lk',
  title: 'Software Engineer',
  company: 'Acme',
  url: 'https://example.com/a',
  rawDescription: 'Build and ship product features.',
  scrapedAt: '2024-01-01T00:00:00.000Z',
};

describe('evaluateJobsForUser', () => {
  const originalMatchesTable = process.env.MATCHES_TABLE_NAME;

  beforeEach(() => {
    process.env.MATCHES_TABLE_NAME = 'job-scout-dev-matches';
    sendMock.mockReset();
    sendMock.mockResolvedValue({});
  });

  afterAll(() => {
    if (originalMatchesTable === undefined) {
      delete process.env.MATCHES_TABLE_NAME;
    } else {
      process.env.MATCHES_TABLE_NAME = originalMatchesTable;
    }
  });

  it('persists a MatchResult for a successfully parsed evaluation', async () => {
    const invokeBedrock = jest
      .fn()
      .mockResolvedValue(
        JSON.stringify({ matchScore: 82, reasoning: 'Strong fit', matchingSkills: ['TypeScript'] }),
      );

    const results = await evaluateJobsForUser('user-1', ['Software Engineer'], [job], { invokeBedrock });

    expect(invokeBedrock).toHaveBeenCalledWith(job, ['Software Engineer']);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      partitionKey: 'user-1#job-a',
      userId: 'user-1',
      jobId: 'job-a',
      matchScore: 82,
      reasoning: 'Strong fit',
      matchingSkills: ['TypeScript'],
    });
    expect(results[0].sentAt).toBeUndefined();

    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0][0] as { TableName: string; Item: Record<string, unknown> };
    expect(sent.TableName).toBe('job-scout-dev-matches');
    expect(sent.Item).toMatchObject({
      PK: 'user-1#job-a',
      SK: 'MATCH',
      gsi1pk: 'USER#user-1',
      gsi1sk: 'SCORE#82#job-a',
    });
  });

  it('parses JSON wrapped in a markdown code fence', async () => {
    const fenced =
      '```json\n{"matchScore": 71, "reasoning": "Good fit", "matchingSkills": ["Node.js"]}\n```';
    const invokeBedrock = jest.fn().mockResolvedValue(fenced);

    const results = await evaluateJobsForUser('user-1', ['Software Engineer'], [job], { invokeBedrock });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ matchScore: 71, matchingSkills: ['Node.js'] });
  });

  it('skips a job without throwing when the Bedrock response is malformed JSON', async () => {
    const invokeBedrock = jest.fn().mockResolvedValue('not json');

    const results = await evaluateJobsForUser('user-1', ['Software Engineer'], [job], { invokeBedrock });

    expect(results).toEqual([]);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('skips a job without throwing when the parsed JSON is missing required fields', async () => {
    const invokeBedrock = jest.fn().mockResolvedValue(JSON.stringify({ matchScore: 82 }));

    const results = await evaluateJobsForUser('user-1', ['Software Engineer'], [job], { invokeBedrock });

    expect(results).toEqual([]);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('truncates a reason longer than 200 characters before saving (C2, AC-11)', async () => {
    const longReason = 'This role lines up with the target roles. '.repeat(10);
    const invokeBedrock = jest
      .fn()
      .mockResolvedValue(JSON.stringify({ matchScore: 75, reasoning: longReason, matchingSkills: [] }));

    const results = await evaluateJobsForUser('user-1', ['Software Engineer'], [job], { invokeBedrock });

    expect(results[0].reasoning.length).toBeLessThanOrEqual(MAX_REASONING_CHARS);
    expect(results[0].reasoning.endsWith('…')).toBe(true);
    const saved = sendMock.mock.calls[0][0] as { Item: { reasoning: string } };
    expect(saved.Item.reasoning).toBe(results[0].reasoning);
  });

  it('keeps a reason of 200 characters or fewer, with whitespace collapsed', async () => {
    const invokeBedrock = jest.fn().mockResolvedValue(
      JSON.stringify({ matchScore: 75, reasoning: '  Strong   fit.\nGood stack. ', matchingSkills: [] }),
    );

    const results = await evaluateJobsForUser('user-1', ['Software Engineer'], [job], { invokeBedrock });

    expect(results[0].reasoning).toBe('Strong fit. Good stack.');
  });
});

describe('Bedrock prompt (C2)', () => {
  beforeEach(() => {
    bedrockSendMock.mockReset();
  });

  it('asks for a short reason without score, company, or location comments', () => {
    const prompt = buildPrompt(job, ['Software Engineer']);

    expect(prompt).toContain('one or two plain sentences');
    expect(prompt).toContain(`at most ${MAX_REASONING_CHARS} characters`);
    expect(prompt).toContain('Do not restate the score');
    expect(prompt).toContain('do not comment on the company name or the location');
    expect(prompt).toContain('{"matchScore": number 0-100, "reasoning": string, "matchingSkills": string[]}');
  });

  it('keeps the 300 output-token cap', async () => {
    bedrockSendMock.mockResolvedValue({
      output: { message: { content: [{ text: '{"matchScore": 1}' }] } },
    });

    await invokeBedrockEvaluation(job, ['Software Engineer']);

    expect(BEDROCK_MAX_TOKENS).toBe(300);
    const command = bedrockSendMock.mock.calls[0][0] as {
      inferenceConfig: { maxTokens: number };
      messages: { content: { text: string }[] }[];
    };
    expect(command.inferenceConfig.maxTokens).toBe(300);
    expect(command.messages[0].content[0].text).toBe(buildPrompt(job, ['Software Engineer']));
  });
});
