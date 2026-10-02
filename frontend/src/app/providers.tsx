'use client';

import { Amplify } from 'aws-amplify';
import type { ReactNode } from 'react';

import { UserProfileProvider } from '@/features/profile/context/UserProfileContext';
import { getAmplifyConfig } from '@/lib/amplify/getAmplifyConfig';

const config = getAmplifyConfig();

if (config) {
  Amplify.configure(config, { ssr: true });
} else if (process.env.NODE_ENV === 'development') {
  console.warn(
    '[Job Scout] Amplify Auth is not configured. After `npm run amplify:sandbox`, copy ' +
      'auth.user_pool_id and auth.user_pool_client_id from amplify_outputs.json into ' +
      'frontend/.env.local as NEXT_PUBLIC_COGNITO_USER_POOL_ID and ' +
      'NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID (see .env.example).',
  );
}

/**
 * Client providers / SDK bootstrap for the App Router.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <UserProfileProvider>{children}</UserProfileProvider>;
}
