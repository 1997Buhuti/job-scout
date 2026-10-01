import type { ResourcesConfig } from 'aws-amplify';

/**
 * Resolve Cognito config for the Next.js app.
 * Values come from public env (filled from Amplify sandbox outputs or an existing pool).
 */
export function getAmplifyConfig(): ResourcesConfig | null {
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID?.trim();
  const userPoolClientId =
    process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID?.trim();

  if (!userPoolId || !userPoolClientId) {
    return null;
  }

  if (
    userPoolId.includes('EXAMPLE') ||
    userPoolId.includes('XXXXXXXXX') ||
    userPoolClientId.startsWith('example') ||
    userPoolClientId.startsWith('xxxx')
  ) {
    return null;
  }

  return {
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
      },
    },
  };
}
