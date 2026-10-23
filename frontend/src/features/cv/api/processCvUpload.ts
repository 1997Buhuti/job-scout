import { requestCvPresign, saveParsedCv, uploadCvToS3 } from '@/lib/api/cvService';

import type { CvProfile } from '../types/cvProfile';
import { extractPdfText } from '../utils/extractPdfText';
import { isEmptyCvProfile, structureCvProfile } from '../utils/structureExtraction';

export interface ProcessCvUploadResult {
  key: string;
  /**
   * The structured profile that was extracted and sent to the API. Undefined
   * when the browser could not read any text from the PDF.
   */
  cvProfile?: CvProfile;
  /** False when the PDF was uploaded but its text could not be extracted. */
  profileExtracted: boolean;
}

/**
 * Reads the PDF in the browser and structures it. Never throws: any failure
 * (scanned/image PDF, corrupt file, worker error, timeout) yields `undefined`
 * so the upload itself is never blocked. Only the error name is logged, never
 * CV content.
 */
async function extractProfile(file: File, key: string): Promise<CvProfile | undefined> {
  try {
    const text = await extractPdfText(file);
    const profile = structureCvProfile(text, key);
    // Nothing recognised: do not overwrite a previously good profile with an empty one.
    return isEmptyCvProfile(profile) ? undefined : profile;
  } catch (error) {
    console.warn(
      '[CV] Could not extract a profile from the PDF:',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return undefined;
  }
}

/**
 * Full client flow for a CV upload:
 *
 * 1. `POST /cv/presign` -> presigned URL + object key
 * 2. In parallel: `PUT` the file to S3, and extract + structure its text locally
 * 3. `POST /cv/parse` with `{ key, cvProfile? }` (the API validates and persists)
 *
 * A failed S3 upload rejects (nothing is saved). A failed extraction does not:
 * the CV is still uploaded and the previous profile, if any, is kept.
 */
export async function processCvUpload(file: File): Promise<ProcessCvUploadResult> {
  const { uploadUrl, key } = await requestCvPresign();

  const [, localProfile] = await Promise.all([
    uploadCvToS3(uploadUrl, file),
    extractProfile(file, key),
  ]);

  await saveParsedCv(key, localProfile);

  return { key, cvProfile: localProfile, profileExtracted: localProfile !== undefined };
}
