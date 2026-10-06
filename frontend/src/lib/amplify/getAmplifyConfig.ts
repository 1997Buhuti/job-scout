import type { ResourcesConfig } from 'aws-amplify';

import amplifyOutputs from '../../../amplify_outputs.json';

/** Shape of the `auth` block written by `npx ampx sandbox`. */
interface AmplifyAuthOutputs {
  user_pool_id?: string;
  user_pool_client_id?: string;
  identity_pool_id?: string;
}

const authOutputs: AmplifyAuthOutputs =
  (amplifyOutputs as { auth?: AmplifyAuthOutputs }).auth ?? {};

const isPlaceholder = (value: string | undefined): boolean => {
  if (!value) {
    return true;
  }
  const normalized = value.trim().toLowerCase();
  return (
    normalized.includes('example') ||
    normalized.includes('xxxxxxxxx') ||
    normalized.startsWith('xxxx')
  );
};

/**
 * Resolve Cognito config for the Next.js app.
 * Precedence: public env vars (deployment overrides) → amplify_outputs.json
 * (generated locally by `npx ampx sandbox --outputs-out-dir .`).
 * Returns null when neither source holds real values so the app still
 * renders signed-out instead of crashing.
 */
export function getAmplifyConfig(): ResourcesConfig | null {
  const userPoolId =
    process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID?.trim() ??
    authOutputs.user_pool_id?.trim();
  const userPoolClientId =
    process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID?.trim() ??
    authOutputs.user_pool_client_id?.trim();
  const identityPoolId = authOutputs.identity_pool_id?.trim();

  if (!userPoolId || !userPoolClientId) {
    return null;
  }

  if (isPlaceholder(userPoolId) || isPlaceholder(userPoolClientId)) {
    return null;
  }

  const validIdentityPoolId =
    identityPoolId && !isPlaceholder(identityPoolId) ? identityPoolId : undefined;

  // Amplify types Auth.Cognito as a strict union: the user-pool-only
  // variant forbids identityPoolId, the combined variant requires it —
  // so each shape must be returned as a distinct literal.
  if (validIdentityPoolId) {
    return {
      Auth: {
        Cognito: {
          userPoolId,
          userPoolClientId,
          identityPoolId: validIdentityPoolId,
        },
      },
    };
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
