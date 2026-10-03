/** Request body for `POST /cv/parse`. */
export interface ParseCvRequest {
  key: string;
}

/** Response returned after parsing the uploaded CV PDF. */
export interface ParseCvResult {
  key: string;
  text: string;
  charCount: number;
}
