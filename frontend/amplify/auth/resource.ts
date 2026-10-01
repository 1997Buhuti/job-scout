import { defineAuth } from '@aws-amplify/backend';

/**
 * Cognito auth for Job Scout (email + password).
 * @see https://docs.amplify.aws/nextjs/build-a-backend/auth/set-up-auth/
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
});
