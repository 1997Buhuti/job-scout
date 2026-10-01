import type { AWS } from '@serverless/typescript';

import { getProfile } from './getProfile';
import { updateProfile } from './updateProfile';

export const profileFunctions: NonNullable<AWS['functions']> = {
  getProfile,
  updateProfile,
};
