import {
  getRecipientStatus,
  isSandboxMode,
  requestRecipientVerification,
} from '@modules/emailModule/recipientStatus';

const createMock = jest.fn();
const getMock = jest.fn();

jest.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  CreateEmailIdentityCommand: jest
    .fn()
    .mockImplementation((input) => ({ input, __type: 'CreateEmailIdentity' })),
  GetEmailIdentityCommand: jest
    .fn()
    .mockImplementation((input) => ({ input, __type: 'GetEmailIdentity' })),
}));

function mockSend(command: { __type?: string }) {
  if (command.__type === 'CreateEmailIdentity') {
    return createMock(command);
  }
  if (command.__type === 'GetEmailIdentity') {
    return getMock(command);
  }
  return Promise.resolve({});
}

const sesError = (name: string): Error =>
  Object.assign(new Error(name), { name, $metadata: {} });

describe('recipientStatus', () => {
  const originalSandbox = process.env.SES_SANDBOX_MODE;

  beforeEach(() => {
    process.env.SES_SANDBOX_MODE = 'true';
    createMock.mockReset();
    getMock.mockReset();
  });

  afterAll(() => {
    if (originalSandbox === undefined) {
      delete process.env.SES_SANDBOX_MODE;
    } else {
      process.env.SES_SANDBOX_MODE = originalSandbox;
    }
  });

  describe('isSandboxMode', () => {
    it('defaults to sandbox when the variable is unset', () => {
      delete process.env.SES_SANDBOX_MODE;
      expect(isSandboxMode()).toBe(true);
    });

    it.each(['false', 'FALSE', ' false '])('is off for %p', (value) => {
      process.env.SES_SANDBOX_MODE = value;
      expect(isSandboxMode()).toBe(false);
    });

    it('is on for "true"', () => {
      expect(isSandboxMode()).toBe(true);
    });
  });

  describe('with SES_SANDBOX_MODE=false (AC-7)', () => {
    beforeEach(() => {
      process.env.SES_SANDBOX_MODE = 'false';
    });

    it('requestRecipientVerification makes no SES call', async () => {
      await expect(requestRecipientVerification('user@example.com')).resolves.toBeNull();
      expect(createMock).not.toHaveBeenCalled();
      expect(getMock).not.toHaveBeenCalled();
    });

    it('getRecipientStatus makes no SES call', async () => {
      await expect(getRecipientStatus('user@example.com')).resolves.toBeNull();
      expect(getMock).not.toHaveBeenCalled();
    });
  });

  describe('requestRecipientVerification', () => {
    it('creates the email identity and returns PENDING (AC-5)', async () => {
      createMock.mockResolvedValueOnce({ VerifiedForSendingStatus: false });

      await expect(requestRecipientVerification('user@example.com')).resolves.toBe(
        'PENDING',
      );
      expect(createMock).toHaveBeenCalledTimes(1);
      expect(createMock.mock.calls[0][0].input).toEqual({
        EmailIdentity: 'user@example.com',
      });
      expect(getMock).not.toHaveBeenCalled();
    });

    it('reads the status instead of re-requesting an existing identity', async () => {
      createMock.mockRejectedValueOnce(sesError('AlreadyExistsException'));
      getMock.mockResolvedValueOnce({ VerificationStatus: 'SUCCESS' });

      await expect(requestRecipientVerification('user@example.com')).resolves.toBe(
        'VERIFIED',
      );
      expect(getMock).toHaveBeenCalledTimes(1);
    });

    it('returns PENDING for an existing identity that is not verified', async () => {
      createMock.mockRejectedValueOnce(sesError('AlreadyExistsException'));
      getMock.mockResolvedValueOnce({ VerificationStatus: 'PENDING' });

      await expect(requestRecipientVerification('user@example.com')).resolves.toBe(
        'PENDING',
      );
    });

    it('rethrows other SES errors', async () => {
      createMock.mockRejectedValueOnce(sesError('TooManyRequestsException'));

      await expect(requestRecipientVerification('user@example.com')).rejects.toThrow(
        'TooManyRequestsException',
      );
    });
  });

  describe('getRecipientStatus', () => {
    it.each([
      ['SUCCESS', 'VERIFIED'],
      ['PENDING', 'PENDING'],
      ['FAILED', 'PENDING'],
      ['TEMPORARY_FAILURE', 'PENDING'],
      ['NOT_STARTED', 'PENDING'],
    ])('maps SES status %s to %s', async (sesStatus, expected) => {
      getMock.mockResolvedValueOnce({ VerificationStatus: sesStatus });

      await expect(getRecipientStatus('user@example.com')).resolves.toBe(expected);
      expect(getMock.mock.calls[0][0].input).toEqual({
        EmailIdentity: 'user@example.com',
      });
    });

    it('returns NOT_REQUESTED when SES has no identity for the address', async () => {
      getMock.mockRejectedValueOnce(sesError('NotFoundException'));

      await expect(getRecipientStatus('user@example.com')).resolves.toBe(
        'NOT_REQUESTED',
      );
    });

    it('rethrows other SES errors', async () => {
      getMock.mockRejectedValueOnce(sesError('AccessDeniedException'));

      await expect(getRecipientStatus('user@example.com')).rejects.toThrow(
        'AccessDeniedException',
      );
    });
  });
});
