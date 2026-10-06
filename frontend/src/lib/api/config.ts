/**
 * Backend API base URL (API Gateway HTTP API).
 *
 * Set NEXT_PUBLIC_API_URL in frontend/.env.local (see .env.example).
 * Routes are mounted at the HTTP API root (no stage path suffix).
 */
const DEFAULT_API_URL =
  'https://iyzfrsxuh6.execute-api.us-east-1.amazonaws.com';

export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (!configured) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[Job Scout] NEXT_PUBLIC_API_URL is not set; using the default API ' +
          'Gateway URL. Set it in frontend/.env.local (see .env.example).',
      );
    }
    return DEFAULT_API_URL;
  }

  return configured.replace(/\/+$/, '');
}
