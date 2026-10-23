import type { APIGatewayProxyEventV2 } from 'aws-lambda';

import { MAX_REQUEST_BODY_BYTES, parseCvPdf } from '@modules/cvModule/parseCvPdf/parseCvPdf';

const updateItemMock = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({ send: updateItemMock })),
  UpdateItemCommand: jest.fn().mockImplementation((input) => input),
}));

const KEY = 'cvs/user-123/1712345678901.pdf';

const buildEvent = (sub: string, body: unknown): APIGatewayProxyEventV2 =>
  ({
    requestContext: { authorizer: { jwt: { claims: { sub } } } },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }) as unknown as APIGatewayProxyEventV2;

const sentUpdate = () => updateItemMock.mock.calls[0][0] as {
  TableName: string;
  Key: Record<string, unknown>;
  UpdateExpression: string;
  ExpressionAttributeValues: Record<string, { S?: string; M?: Record<string, any> }>; // eslint-disable-line @typescript-eslint/no-explicit-any
};

const clientProfile = {
  fullName: 'Buhuti Manakal',
  summary: 'Full-stack engineer.',
  skills: ['C#', '.NET', 'AWS'],
  experience: [
    { title: 'Software Engineer', company: 'Random Software Ltd', period: 'May 2023 - Present', summary: 'Built things.' },
  ],
  education: [{ institution: 'University of Kelaniya', degree: 'BA (Hons)', field: 'Computer Studies', year: '2018 - 2022' }],
  extractedAt: '1999-01-01T00:00:00.000Z',
  sourceCvS3Key: 'cvs/someone-else/forged.pdf',
};

describe('parseCvPdf (save CV + browser-extracted profile)', () => {
  const originalUsersTable = process.env.USERS_TABLE_NAME;

  beforeEach(() => {
    process.env.USERS_TABLE_NAME = 'job-scout-dev-users';
    updateItemMock.mockReset();
    updateItemMock.mockResolvedValue({});
  });

  afterAll(() => {
    if (originalUsersTable === undefined) {
      delete process.env.USERS_TABLE_NAME;
    } else {
      process.env.USERS_TABLE_NAME = originalUsersTable;
    }
  });

  it('persists cvS3Key and the sanitized cvProfile, and returns only the key', async () => {
    const result = await parseCvPdf({ event: buildEvent('user-123', { key: KEY, cvProfile: clientProfile }) });

    expect(result).toEqual({ key: KEY });
    expect(updateItemMock).toHaveBeenCalledTimes(1);

    const update = sentUpdate();
    expect(update.TableName).toBe('job-scout-dev-users');
    expect(update.Key).toEqual({ userId: { S: 'user-123' } });
    expect(update.UpdateExpression).toBe('SET cvS3Key = :cvS3Key, updatedAt = :updatedAt, cvProfile = :cvProfile');
    expect(update.ExpressionAttributeValues[':cvS3Key']).toEqual({ S: KEY });

    const stored = update.ExpressionAttributeValues[':cvProfile'].M!;
    expect(stored.fullName).toEqual({ S: 'Buhuti Manakal' });
    expect(stored.summary).toEqual({ S: 'Full-stack engineer.' });
    expect(stored.skills).toEqual({ L: [{ S: 'C#' }, { S: '.NET' }, { S: 'AWS' }] });
    expect(stored.experience.L[0].M).toEqual({
      title: { S: 'Software Engineer' },
      company: { S: 'Random Software Ltd' },
      period: { S: 'May 2023 - Present' },
      summary: { S: 'Built things.' },
    });
    expect(stored.education.L[0].M).toEqual({
      institution: { S: 'University of Kelaniya' },
      degree: { S: 'BA (Hons)' },
      field: { S: 'Computer Studies' },
      year: { S: '2018 - 2022' },
    });
  });

  it('ignores client-supplied extractedAt / sourceCvS3Key (AC-11)', async () => {
    await parseCvPdf({ event: buildEvent('user-123', { key: KEY, cvProfile: clientProfile }) });

    const stored = sentUpdate().ExpressionAttributeValues[':cvProfile'].M!;
    expect(stored.sourceCvS3Key).toEqual({ S: KEY });
    expect(stored.extractedAt.S).not.toBe('1999-01-01T00:00:00.000Z');
    expect(new Date(stored.extractedAt.S as string).getFullYear()).toBeGreaterThanOrEqual(2024);
  });

  it('omits absent optional fields instead of storing NULL', async () => {
    await parseCvPdf({
      event: buildEvent('user-123', {
        key: KEY,
        cvProfile: { skills: ['Go'], experience: [{ title: 'Dev', company: 'Acme' }], education: [] },
      }),
    });

    const stored = sentUpdate().ExpressionAttributeValues[':cvProfile'].M!;
    expect(stored).not.toHaveProperty('fullName');
    expect(stored).not.toHaveProperty('summary');
    expect(stored.experience.L[0].M).toEqual({ title: { S: 'Dev' }, company: { S: 'Acme' } });
  });

  it('saves only the S3 pointer when no cvProfile is sent, keeping any previous profile', async () => {
    await parseCvPdf({ event: buildEvent('user-123', { key: KEY }) });

    const update = sentUpdate();
    expect(update.UpdateExpression).toBe('SET cvS3Key = :cvS3Key, updatedAt = :updatedAt');
    expect(update.ExpressionAttributeValues).not.toHaveProperty(':cvProfile');
  });

  it('treats a null cvProfile like an absent one', async () => {
    await parseCvPdf({ event: buildEvent('user-123', { key: KEY, cvProfile: null }) });

    expect(sentUpdate().UpdateExpression).not.toContain('cvProfile');
  });

  it('rejects keys outside the authenticated user prefix (403) without writing', async () => {
    await expect(
      parseCvPdf({ event: buildEvent('user-123', { key: 'cvs/other-user/abc.pdf', cvProfile: clientProfile }) }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(updateItemMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing key', { cvProfile: clientProfile }],
    ['an empty key', { key: '  ' }],
    ['a non-object cvProfile', { key: KEY, cvProfile: 'skills' }],
    ['an array cvProfile', { key: KEY, cvProfile: [] }],
    ['non-array skills', { key: KEY, cvProfile: { skills: 'JS' } }],
  ])('rejects %s with 400 and no write', async (_label, body) => {
    await expect(parseCvPdf({ event: buildEvent('user-123', body) })).rejects.toMatchObject({ statusCode: 400 });

    expect(updateItemMock).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON and oversized bodies with 400', async () => {
    await expect(parseCvPdf({ event: buildEvent('user-123', '{not json') })).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      parseCvPdf({ event: buildEvent('user-123', JSON.stringify({ key: KEY, pad: 'x'.repeat(MAX_REQUEST_BODY_BYTES) })) }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(updateItemMock).not.toHaveBeenCalled();
  });

  it('surfaces DynamoDB failures instead of reporting success', async () => {
    updateItemMock.mockRejectedValue(new Error('ProvisionedThroughputExceeded'));

    await expect(
      parseCvPdf({ event: buildEvent('user-123', { key: KEY, cvProfile: clientProfile }) }),
    ).rejects.toMatchObject({ statusCode: 500, code: 'DATABASE_ERROR' });
  });

  it('fails loudly when USERS_TABLE_NAME is not configured', async () => {
    delete process.env.USERS_TABLE_NAME;

    await expect(parseCvPdf({ event: buildEvent('user-123', { key: KEY }) })).rejects.toThrow('USERS_TABLE_NAME');
  });
});
