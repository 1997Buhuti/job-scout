import { requestCvPresign, saveParsedCv, uploadCvToS3 } from '@/lib/api/cvService';

import type { CvProfile } from '../../types/cvProfile';
import { EmptyPdfTextError } from '../../utils/extractPdfText';
import { extractPdfText } from '../../utils/extractPdfText';
import { processCvUpload } from '../processCvUpload';

jest.mock('@/lib/api/cvService', () => ({
  requestCvPresign: jest.fn(),
  uploadCvToS3: jest.fn(),
  saveParsedCv: jest.fn(),
}));

jest.mock('../../utils/extractPdfText', () => ({
  ...jest.requireActual('../../utils/extractPdfText'),
  extractPdfText: jest.fn(),
}));

const KEY = 'cvs/user-1/1700000000000.pdf';
const CV_TEXT = 'Jane Doe\n\nSkills\nTypeScript, React, AWS';

const file = new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' });

const presign = requestCvPresign as jest.Mock;
const upload = uploadCvToS3 as jest.Mock;
const save = saveParsedCv as jest.Mock;
const extract = extractPdfText as jest.Mock;

describe('processCvUpload', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    presign.mockResolvedValue({ uploadUrl: 'https://s3.example/put', key: KEY, expiresIn: 300 });
    upload.mockResolvedValue(undefined);
    save.mockResolvedValue(undefined);
    extract.mockResolvedValue(CV_TEXT);
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('uploads to S3, structures the CV locally and saves { key, cvProfile }', async () => {
    const result = await processCvUpload(file);

    expect(upload).toHaveBeenCalledWith('https://s3.example/put', file);
    expect(save).toHaveBeenCalledTimes(1);

    const [savedKey, savedProfile] = save.mock.calls[0] as [string, CvProfile];
    expect(savedKey).toBe(KEY);
    expect(savedProfile.sourceCvS3Key).toBe(KEY);
    expect(savedProfile.fullName).toBe('Jane Doe');
    expect(savedProfile.skills).toEqual(expect.arrayContaining(['TypeScript', 'React', 'AWS']));

    expect(result.key).toBe(KEY);
    expect(result.profileExtracted).toBe(true);
    expect(result.cvProfile?.skills).toEqual(savedProfile.skills);
  });

  it('still uploads and saves { key } when the PDF has no readable text', async () => {
    extract.mockRejectedValue(new EmptyPdfTextError());

    const result = await processCvUpload(file);

    expect(upload).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(KEY, undefined);
    expect(result).toEqual({ key: KEY, cvProfile: undefined, profileExtracted: false });
    expect(warn).toHaveBeenCalledWith(expect.any(String), 'EmptyPdfTextError');
  });

  it('does not log CV content when extraction fails', async () => {
    extract.mockRejectedValue(new Error(`bad pdf containing ${CV_TEXT}`));

    await processCvUpload(file);

    expect(JSON.stringify(warn.mock.calls)).not.toContain('Jane Doe');
  });

  it('does not overwrite a previous profile with an empty one', async () => {
    extract.mockResolvedValue('lorem ipsum dolor sit amet');

    const result = await processCvUpload(file);

    expect(save).toHaveBeenCalledWith(KEY, undefined);
    expect(result.profileExtracted).toBe(false);
  });

  it('does not call the API when the S3 upload fails', async () => {
    upload.mockRejectedValue(new Error('S3 upload failed (HTTP 403). Please try again.'));

    await expect(processCvUpload(file)).rejects.toThrow(/S3 upload failed/);
    expect(save).not.toHaveBeenCalled();
  });

  it('propagates API save errors', async () => {
    save.mockRejectedValue(new Error('Could not save the uploaded CV (HTTP 400)'));

    await expect(processCvUpload(file)).rejects.toThrow(/Could not save/);
  });

  it('stops before uploading when presign fails', async () => {
    presign.mockRejectedValue(new Error('You must be signed in to upload a CV.'));

    await expect(processCvUpload(file)).rejects.toThrow(/signed in/);
    expect(upload).not.toHaveBeenCalled();
    expect(extract).not.toHaveBeenCalled();
  });
});
