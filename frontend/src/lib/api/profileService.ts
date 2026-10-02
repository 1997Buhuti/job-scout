import { fetchAuthSession, fetchUserAttributes, getCurrentUser } from 'aws-amplify/auth';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  'https://iyzfrsxuh6.execute-api.us-east-1.amazonaws.com';

export interface UserProfileData {
  userId: string;
  email: string;
  targetRoles: string[];
  cvS3Key?: string;
  scheduleIntervalDays: number;
  schedulerEnabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserDetail {
  name: string;
  email: string;
  userId: string;
  sub: string;
  profile?: UserProfileData | null;
}

/**
 * Retrieves the current Cognito session's ID Token for API Authorization header.
 */
export async function getIdToken(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  } catch (err) {
    console.warn('[Profile API] Could not retrieve session ID token:', err);
    return null;
  }
}

/**
 * Fetch user profile from GET /me/profile endpoint.
 */
export async function getProfile(): Promise<UserProfileData | null> {
  try {
    const token = await getIdToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE_URL}/me/profile`, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      console.warn(`[Profile API] GET /me/profile status ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data as UserProfileData;
  } catch (err) {
    console.error('[Profile API] Error fetching profile:', err);
    return null;
  }
}

/**
 * Update user profile targetRoles via PUT /me/profile endpoint.
 */
export async function updateProfile(
  payload: Partial<UserProfileData>
): Promise<UserProfileData | null> {
  try {
    const token = await getIdToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE_URL}/me/profile`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Failed to update profile (${res.status})`);
    }

    const data = await res.json();
    return data as UserProfileData;
  } catch (err) {
    console.error('[Profile API] Error updating profile:', err);
    throw err;
  }
}

/**
 * Aggregate Cognito user attributes and API profile data.
 */
export async function getLoggedInUserDetail(): Promise<UserDetail | null> {
  try {
    const currentUser = await getCurrentUser().catch(() => null);
    if (!currentUser) return null;

    const attributes = ((await fetchUserAttributes().catch(() => ({}))) || {}) as Record<string, string>;
    const profile = await getProfile();

    const email = attributes.email || profile?.email || currentUser.username || 'user@example.com';
    
    // Derive human display name
    let name = attributes.name || attributes.given_name || '';
    if (!name && email) {
      const parts = email.split('@')[0].split(/[._-]/);
      name = parts.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    }
    if (!name) name = 'Job Scout User';

    return {
      name,
      email,
      userId: currentUser.userId,
      sub: attributes.sub || currentUser.userId,
      profile,
    };
  } catch (err) {
    console.error('[Profile API] Error getting user details:', err);
    return null;
  }
}
