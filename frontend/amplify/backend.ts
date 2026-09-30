import { defineBackend } from '@aws-amplify/backend';

import { auth } from './auth/resource';

/**
 * Amplify Gen 2 backend — auth only for 03-auth-profile.
 */
defineBackend({
  auth,
});
