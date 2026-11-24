import {
  checkSenderDomain,
  resetSenderCheckCache,
  senderDomainOf,
} from '@modules/emailModule/senderCheck';

const getMock = jest.fn();

jest.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  GetEmailIdentityCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

function mockSend(command: unknown) {
  return getMock(command);
}

const sesError = (name: string): Error => Object.assign(new Error(name), { name });

describe('senderDomainOf', () => {
  it.each([
    ['digest@jobscout.example', 'jobscout.example'],
    ['  Digest@JobScout.Example ', 'jobscout.example'],
    ['noreply@mail.jobscout.example', 'mail.jobscout.example'],
  ])('reads the domain from %p', (address, domain) => {
    expect(senderDomainOf(address)).toBe(domain);
  });

  it.each([undefined, '', 'not-an-address', 'Job Scout <digest@jobscout.example>', 'a@b', 'a@@b.c'])(
    'rejects %p',
    (address) => {
      expect(senderDomainOf(address)).toBeNull();
    },
  );
});

describe('checkSenderDomain (M1, AC-4)', () => {
  beforeEach(() => {
    resetSenderCheckCache();
    getMock.mockReset();
  });

  it('allows a domain verified for sending', async () => {
    getMock.mockResolvedValueOnce({ VerifiedForSendingStatus: true, VerificationStatus: 'SUCCESS' });

    await expect(checkSenderDomain('digest@jobscout.example')).resolves.toEqual({
      ok: true,
      domain: 'jobscout.example',
    });
    expect(getMock.mock.calls[0][0].input).toEqual({ EmailIdentity: 'jobscout.example' });
  });

  it('refuses a domain that is not verified for sending', async () => {
    getMock.mockResolvedValueOnce({ VerifiedForSendingStatus: false, VerificationStatus: 'FAILED' });

    await expect(checkSenderDomain('digest@jobscout.example')).resolves.toEqual({
      ok: false,
      domain: 'jobscout.example',
      reason: 'SES domain jobscout.example is not verified for sending (verification status FAILED)',
    });
  });

  it('refuses a domain with no SES identity', async () => {
    getMock.mockRejectedValueOnce(sesError('NotFoundException'));

    const result = await checkSenderDomain('digest@jobscout.example');

    expect(result).toMatchObject({ ok: false, reason: 'No SES identity exists for domain jobscout.example' });
  });

  it.each([
    [undefined, 'SES_FROM_ADDRESS is not set'],
    ['Job Scout <digest@jobscout.example>', 'SES_FROM_ADDRESS must be a bare email address such as digest@example.com'],
  ])('refuses sender %p without calling SES', async (address, reason) => {
    await expect(checkSenderDomain(address)).resolves.toEqual({ ok: false, domain: null, reason });
    expect(getMock).not.toHaveBeenCalled();
  });

  it('caches a result per container until the TTL passes', async () => {
    const getSenderIdentity = jest.fn().mockResolvedValue({ verifiedForSending: true });
    let now = 0;
    const deps = { getSenderIdentity, now: () => now };

    await checkSenderDomain('digest@jobscout.example', deps);
    now = 9 * 60 * 1000;
    await checkSenderDomain('other@jobscout.example', deps);
    expect(getSenderIdentity).toHaveBeenCalledTimes(1);

    now = 11 * 60 * 1000;
    await checkSenderDomain('digest@jobscout.example', deps);
    expect(getSenderIdentity).toHaveBeenCalledTimes(2);
  });

  it('throws other SES errors and does not cache them', async () => {
    getMock.mockRejectedValueOnce(sesError('TooManyRequestsException'));
    getMock.mockResolvedValueOnce({ VerifiedForSendingStatus: true });

    await expect(checkSenderDomain('digest@jobscout.example')).rejects.toThrow(
      'TooManyRequestsException',
    );
    await expect(checkSenderDomain('digest@jobscout.example')).resolves.toMatchObject({ ok: true });
  });
});
