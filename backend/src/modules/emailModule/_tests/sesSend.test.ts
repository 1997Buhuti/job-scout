import {
  isTransientSesError,
  sendDigestEmail,
  withSesRetry,
} from '@modules/emailModule/sesSend';

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  SendEmailCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

function mockSend(command: unknown) {
  return sendMock(command);
}

const sesError = (name: string, extra: Record<string, unknown> = {}): Error =>
  Object.assign(new Error(name), { name, ...extra });

describe('sendDigestEmail (C3)', () => {
  beforeEach(() => {
    sendMock.mockReset().mockResolvedValue({ MessageId: 'msg-1' });
  });

  it('sends HTML and text bodies through SES v2 SendEmail', async () => {
    const result = await sendDigestEmail({
      to: 'user@example.com',
      from: 'digest@jobscout.example',
      subject: 'Job Scout: 1 new job match',
      html: '<p>hi</p>',
      text: 'hi',
    });

    expect(result).toEqual({ messageId: 'msg-1' });
    expect(sendMock.mock.calls[0][0].input).toEqual({
      FromEmailAddress: 'digest@jobscout.example',
      Destination: { ToAddresses: ['user@example.com'] },
      Content: {
        Simple: {
          Subject: { Data: 'Job Scout: 1 new job match', Charset: 'UTF-8' },
          Body: {
            Html: { Data: '<p>hi</p>', Charset: 'UTF-8' },
            Text: { Data: 'hi', Charset: 'UTF-8' },
          },
        },
      },
    });
  });

  it('passes headers through when given', async () => {
    await sendDigestEmail({
      to: 'user@example.com',
      from: 'digest@jobscout.example',
      subject: 's',
      html: 'h',
      text: 't',
      headers: [{ name: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' }],
    });

    expect(sendMock.mock.calls[0][0].input.Content.Simple.Headers).toEqual([
      { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' },
    ]);
  });
});

describe('isTransientSesError', () => {
  it.each([
    sesError('TooManyRequestsException'),
    sesError('Throttling'),
    sesError('InternalFailure'),
    sesError('Whatever', { $metadata: { httpStatusCode: 503 } }),
    sesError('Whatever', { $metadata: { httpStatusCode: 429 } }),
    sesError('Whatever', { $retryable: {} }),
    Object.assign(new Error('socket'), { code: 'ECONNRESET' }),
  ])('treats %p as transient', (err) => {
    expect(isTransientSesError(err)).toBe(true);
  });

  it.each([
    sesError('MessageRejected', { $metadata: { httpStatusCode: 400 } }),
    sesError('AccessDeniedException', { $metadata: { httpStatusCode: 403 } }),
    sesError('SendingPausedException'),
    new Error('plain'),
    'string error',
    null,
  ])('treats %p as permanent', (err) => {
    expect(isTransientSesError(err)).toBe(false);
  });
});

describe('withSesRetry (M5)', () => {
  const sleep = jest.fn(async () => undefined);

  beforeEach(() => sleep.mockClear());

  it('returns the first success without sleeping', async () => {
    const fn = jest.fn().mockResolvedValue('ok');

    await expect(withSesRetry(fn, { sleep })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries transient errors with backoff', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(sesError('Throttling'))
      .mockRejectedValueOnce(sesError('Throttling'))
      .mockResolvedValue('ok');
    const onRetry = jest.fn();

    await expect(withSesRetry(fn, { sleep, onRetry })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[250], [500]]);
    expect(onRetry.mock.calls.map(([attempt]) => attempt)).toEqual([1, 2]);
  });

  it('stops after maxAttempts and rethrows the last error', async () => {
    const fn = jest.fn().mockRejectedValue(sesError('Throttling'));

    await expect(withSesRetry(fn, { sleep, maxAttempts: 2 })).rejects.toThrow('Throttling');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry a permanent error', async () => {
    const fn = jest.fn().mockRejectedValue(sesError('MessageRejected'));

    await expect(withSesRetry(fn, { sleep })).rejects.toThrow('MessageRejected');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
