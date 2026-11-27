import { AWS } from '@serverless/typescript';

import { unsubscribeFunctions } from './unsubscribe';
import { handleSesEventFunctions } from './handleSesEvent';

/**
 * Email module functions.
 */
export const emailFunctions: AWS['functions'] = {
  ...unsubscribeFunctions,
  ...handleSesEventFunctions,
};
