import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_ATTEMPTS = 3;

const DEFAULT_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent':
    'JobScout/1.0 (+https://github.com/job-scout; respectful scheduled job indexer)',
};

export interface PortalHttpClient {
  getText(url: string): Promise<string>;
  getJson(url: string): Promise<unknown>;
  postForm(url: string, fields: Record<string, string>): Promise<string>;
  postJson(url: string, body: unknown): Promise<unknown>;
}

const requestConfig = (extra: AxiosRequestConfig = {}): AxiosRequestConfig => ({
  timeout: REQUEST_TIMEOUT_MS,
  maxContentLength: MAX_RESPONSE_BYTES,
  maxBodyLength: MAX_RESPONSE_BYTES,
  headers: DEFAULT_HEADERS,
  validateStatus: (status) => status >= 200 && status < 300,
  ...extra,
});

const isRetryable = (error: unknown): boolean => {
  if (!axios.isAxiosError(error)) return false;
  if (!error.response) return true;
  return error.response.status === 429 || error.response.status >= 500;
};

const requestWithRetry = async <T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await axios.request<T>(config);
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === MAX_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
};

export const portalHttpClient: PortalHttpClient = {
  async getText(url) {
    const response = await requestWithRetry<string>(
      requestConfig({ method: 'GET', url, responseType: 'text' }),
    );
    return response.data;
  },

  async getJson(url) {
    const response = await requestWithRetry<unknown>(
      requestConfig({ method: 'GET', url, responseType: 'json' }),
    );
    return response.data;
  },

  async postForm(url, fields) {
    const response = await requestWithRetry<string>(
      requestConfig({
        method: 'POST',
        url,
        data: new URLSearchParams(fields).toString(),
        responseType: 'text',
        headers: {
          ...DEFAULT_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }),
    );
    return response.data;
  },

  async postJson(url, body) {
    const response = await requestWithRetry<unknown>(
      requestConfig({
        method: 'POST',
        url,
        data: body,
        responseType: 'json',
        headers: { ...DEFAULT_HEADERS, 'Content-Type': 'application/json' },
      }),
    );
    return response.data;
  },
};
