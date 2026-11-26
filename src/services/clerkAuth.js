import { Linking } from 'react-native';
import { tokenCache } from '../utils/tokenCache';

const CLERK_FAPI_URL = 'https://enough-hare-1.clerk.accounts.dev/v1';
const STORAGE_KEY = 'clerk_native_session_v1';
const PENDING_OAUTH_KEY = 'clerk_pending_oauth_v1';
export const OAUTH_REDIRECT_URL = 'faceattendance://oauth-native-callback';

function parseUser(rawUser) {
  if (!rawUser) return null;
  const fullName = [rawUser.first_name, rawUser.last_name].filter(Boolean).join(' ').trim();
  const primaryEmail =
    rawUser.email_addresses?.find(e => e.id === rawUser.primary_email_address_id)?.email_address ||
    rawUser.email_addresses?.[0]?.email_address ||
    null;

  return {
    id: rawUser.id,
    fullName: fullName || rawUser.username || primaryEmail || 'Staff',
    primaryEmailAddress: primaryEmail ? { emailAddress: primaryEmail } : null,
    publicMetadata: rawUser.public_metadata || {},
  };
}

export async function startGoogleOAuth() {
  const body = new URLSearchParams({
    strategy: 'oauth_google',
    redirect_url: OAUTH_REDIRECT_URL,
    action_complete_redirect_url: OAUTH_REDIRECT_URL,
  }).toString();

  const res = await fetch(`${CLERK_FAPI_URL}/client/sign_ins?_is_native=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = await res.json();
  if (!res.ok) {
    const errMsg =
      json?.errors?.[0]?.long_message ||
      json?.errors?.[0]?.message ||
      'Unable to start Google Sign-In.';
    throw new Error(errMsg);
  }

  const clientToken = res.headers.get('authorization') || res.headers.get('Authorization');
  const signInId = json?.response?.id;
  const externalUrl =
    json?.response?.first_factor_verification?.external_verification_redirect_url;

  if (!externalUrl || !clientToken) {
    throw new Error('Google OAuth redirect URL not returned by Clerk.');
  }

  await tokenCache.saveToken(
    PENDING_OAUTH_KEY,
    JSON.stringify({ clientToken, signInId }),
  );

  await Linking.openURL(externalUrl);
}

function parseQueryParams(url) {
  const queryString = url?.split('?')[1]?.split('#')[0] || '';
  const result = {};
  if (!queryString) return result;
  for (const part of queryString.split('&')) {
    if (!part) continue;
    const eqIdx = part.indexOf('=');
    const key = eqIdx >= 0 ? part.slice(0, eqIdx) : part;
    const val = eqIdx >= 0 ? part.slice(eqIdx + 1) : '';
    try {
      result[decodeURIComponent(key)] = decodeURIComponent(val.replace(/\+/g, ' '));
    } catch {
      result[key] = val;
    }
  }
  return result;
}

export async function completeGoogleOAuthCallback(callbackUrl) {
  const pendingRaw = await tokenCache.getToken(PENDING_OAUTH_KEY);
  if (!pendingRaw) return null;

  const { clientToken, signInId } = JSON.parse(pendingRaw);
  const params = parseQueryParams(callbackUrl);
  const rotatingNonce = params.rotating_token_nonce || null;
  const createdSessionId = params.created_session_id || null;

  let latestClientToken = clientToken;
  let sessions = [];
  let signInObj = null;
  let nonceConsumed = false;

  if (signInId) {
    const nonceParam = rotatingNonce
      ? `&rotating_token_nonce=${encodeURIComponent(rotatingNonce)}`
      : '';
    if (rotatingNonce) nonceConsumed = true;

    const res = await fetch(
      `${CLERK_FAPI_URL}/client/sign_ins/${signInId}?_is_native=true${nonceParam}`,
      {
        method: 'GET',
        headers: { Authorization: latestClientToken },
      },
    );
    const json = await res.json();
    latestClientToken = res.headers.get('authorization') || latestClientToken;
    signInObj = json?.response || null;
    sessions = json?.client?.sessions || [];
  }

  // Handle new Google user transfer (sign_in -> sign_up)
  if (
    sessions.length === 0 &&
    signInObj?.first_factor_verification?.status === 'transferable'
  ) {
    const transferRes = await fetch(`${CLERK_FAPI_URL}/client/sign_ups?_is_native=true`, {
      method: 'POST',
      headers: {
        Authorization: latestClientToken,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'transfer=true',
    });
    const transferJson = await transferRes.json();
    latestClientToken = transferRes.headers.get('authorization') || latestClientToken;
    sessions = transferJson?.client?.sessions || [];
  }

  if (sessions.length === 0) {
    const nonceParam =
      rotatingNonce && !nonceConsumed
        ? `&rotating_token_nonce=${encodeURIComponent(rotatingNonce)}`
        : '';
    const clientRes = await fetch(`${CLERK_FAPI_URL}/client?_is_native=true${nonceParam}`, {
      method: 'GET',
      headers: { Authorization: latestClientToken },
    });
    const clientJson = await clientRes.json();
    latestClientToken = clientRes.headers.get('authorization') || latestClientToken;
    sessions = clientJson?.response?.sessions || clientJson?.client?.sessions || [];
  }

  const targetSessionId = createdSessionId || signInObj?.created_session_id;
  const activeSession =
    (targetSessionId && sessions.find(s => s.id === targetSessionId)) ||
    sessions.find(s => s.status === 'active') ||
    sessions[0];

  if (!activeSession) {
    const statusInfo = signInObj?.status
      ? ` (status: ${signInObj.status}, verification: ${signInObj.first_factor_verification?.status || 'unknown'})`
      : '';
    throw new Error(`Google sign-in did not produce an active Clerk session.${statusInfo}`);
  }

  const sessionData = {
    clientToken: latestClientToken,
    sessionId: activeSession.id,
    jwt: activeSession.last_active_token?.jwt || null,
    user: parseUser(activeSession.user),
  };

  await tokenCache.saveToken(STORAGE_KEY, JSON.stringify(sessionData));
  await tokenCache.clearToken(PENDING_OAUTH_KEY);
  return sessionData;
}

export async function restoreClerkSession() {
  const raw = await tokenCache.getToken(STORAGE_KEY);
  if (!raw) return null;

  let stored;
  try {
    stored = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!stored?.clientToken || !stored?.sessionId) return null;

  try {
    const res = await fetch(`${CLERK_FAPI_URL}/client?_is_native=true`, {
      method: 'GET',
      headers: { Authorization: stored.clientToken },
    });
    if (!res.ok) {
      if (res.status === 401) {
        await tokenCache.clearToken(STORAGE_KEY);
        return null;
      }
      return stored;
    }

    const json = await res.json();
    const sessions = json?.response?.sessions || json?.client?.sessions || [];
    const active =
      sessions.find(s => s.id === stored.sessionId && s.status === 'active') ||
      sessions.find(s => s.status === 'active');

    if (!active) {
      await tokenCache.clearToken(STORAGE_KEY);
      return null;
    }

    const updated = {
      clientToken: res.headers.get('authorization') || stored.clientToken,
      sessionId: active.id,
      jwt: active.last_active_token?.jwt || stored.jwt,
      user: parseUser(active.user),
    };
    await tokenCache.saveToken(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return stored;
  }
}

export async function refreshClerkToken() {
  const raw = await tokenCache.getToken(STORAGE_KEY);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw);
    if (!stored?.clientToken || !stored?.sessionId) return stored?.jwt || null;
    const res = await fetch(
      `${CLERK_FAPI_URL}/client/sessions/${stored.sessionId}/tokens?_is_native=true`,
      {
        method: 'POST',
        headers: { Authorization: stored.clientToken },
      },
    );
    if (!res.ok) return stored.jwt || null;
    const json = await res.json();
    const jwt = json?.jwt || stored.jwt;
    stored.jwt = jwt;
    await tokenCache.saveToken(STORAGE_KEY, JSON.stringify(stored));
    return jwt;
  } catch {
    return null;
  }
}

export async function signOutClerk() {
  const raw = await tokenCache.getToken(STORAGE_KEY);
  try {
    if (raw) {
      const stored = JSON.parse(raw);
      if (stored?.clientToken && stored?.sessionId) {
        await fetch(
          `${CLERK_FAPI_URL}/client/sessions/${stored.sessionId}/end?_is_native=true`,
          {
            method: 'POST',
            headers: { Authorization: stored.clientToken },
          },
        );
      }
    }
  } catch {
    // Ignore network error on sign out
  } finally {
    await tokenCache.clearToken(STORAGE_KEY);
    await tokenCache.clearToken(PENDING_OAUTH_KEY);
  }
}
