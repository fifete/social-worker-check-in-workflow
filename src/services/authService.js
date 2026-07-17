import { getDB } from '../db/db.js';

const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
// Trigger silent refresh when the token is 50 minutes old (10-minute safety buffer before the 1-hour Google hard limit)
const SILENT_REFRESH_THRESHOLD_MS = 50 * 60 * 1000;
export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
].join(' ');

let googleIdentityScriptPromise = null;

export function loadGoogleIdentityScript() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Google Identity Services can only be loaded in the browser.'));
  }

  if (window.google?.accounts?.oauth2) {
    return Promise.resolve(window.google);
  }

  if (!googleIdentityScriptPromise) {
    googleIdentityScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT_URL}"]`);

      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(window.google), { once: true });
        existingScript.addEventListener('error', () => {
          reject(new Error('Failed to load Google Identity Services script.'));
        }, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = GOOGLE_IDENTITY_SCRIPT_URL;
      script.async = true;
      script.defer = true;

      script.onload = () => resolve(window.google);
      script.onerror = () => reject(new Error('Failed to load Google Identity Services script.'));

      document.head.appendChild(script);
    });
  }

  return googleIdentityScriptPromise;
}

export function initTokenClient(onAuthSuccess, onAuthError) {
  if (typeof window === 'undefined' || !window.google?.accounts?.oauth2?.initTokenClient) {
    throw new Error('Google Identity Services token client is not available.');
  }

  let client;
  client = window.google.accounts.oauth2.initTokenClient({
    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    scope: SCOPES,
    // If a silent re-auth attempt (prompt: 'none') fails because interaction is required,
    // automatically fall back to an interactive consent dialog.
    error_callback: (error) => {
      if (error?.type !== 'popup_closed') {
        client.requestAccessToken({ prompt: 'consent' });
      }
    },
    callback: async (response) => {
      if (response?.error) {
        onAuthError?.(response);
        return;
      }

      try {
        const savedSession = await saveSessionToken(response);
        onAuthSuccess?.(savedSession);
      } catch (error) {
        onAuthError?.(error);
      }
    },
  });
  return client;
}

export async function saveSessionToken(tokenResponse) {
  const accessToken = tokenResponse?.access_token;

  if (!accessToken) {
    throw new Error('A Google access token is required to persist the session.');
  }

  const db = await getDB();
  const tx = db.transaction(['sessionStateStore'], 'readwrite');
  const store = tx.objectStore('sessionStateStore');

  // Read the existing record so we can preserve workingFileId, masterFileId,
  // and any previously stored refreshToken (Google only sends it on the first grant).
  const existing = await store.get('CURRENT_SESSION');

  const sessionRecord = {
    ...(existing ?? {}),
    sessionId: 'CURRENT_SESSION',
    accessToken,
    refreshToken: tokenResponse.refresh_token ?? existing?.refreshToken ?? null,
    tokenIssuedAt: Date.now(),
    workingFileId: existing?.workingFileId ?? null,
    masterFileId: existing?.masterFileId ?? null,
  };

  await store.put(sessionRecord);
  await tx.done;

  return sessionRecord;
}

export async function getValidToken() {
  const db = await getDB();
  const session = await db
    .transaction(['sessionStateStore'], 'readonly')
    .objectStore('sessionStateStore')
    .get('CURRENT_SESSION');

  if (!session?.accessToken) {
    return null;
  }

  const ageMs = Date.now() - (session.tokenIssuedAt ?? 0);

  // Token is fresh — return immediately without a network call
  if (ageMs < SILENT_REFRESH_THRESHOLD_MS) {
    return session.accessToken;
  }

  // Token is stale — attempt a silent refresh using the stored refresh token
  if (session.refreshToken) {
    try {
      const params = new URLSearchParams({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: session.refreshToken,
      });

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (response.ok) {
        const data = await response.json();
        await saveSessionToken(data);
        return data.access_token;
      }

      // 4xx means the refresh token itself is revoked or expired — clear credentials
      if (response.status >= 400 && response.status < 500) {
        const clearTx = db.transaction(['sessionStateStore'], 'readwrite');
        const clearStore = clearTx.objectStore('sessionStateStore');
        const stale = await clearStore.get('CURRENT_SESSION');
        if (stale) {
          await clearStore.put({ ...stale, accessToken: null, refreshToken: null });
        }
        await clearTx.done;
      }
    } catch {
      // Network failure (device offline) — return null so the caller
      // shows the offline guardrail instead of crashing
    }

    return null;
  }

  // No refresh token available — caller must trigger interactive re-auth
  return null;
}

export function requestGoogleAuth(tokenClient, promptType = '') {
  if (!tokenClient?.requestAccessToken) {
    throw new Error('Google token client is not available.');
  }

  return tokenClient.requestAccessToken({
    prompt: promptType || 'select_account',
  });
}

export function handleExpiredTokenReAuth(tokenClient) {
  if (!tokenClient?.requestAccessToken) {
    throw new Error('Google token client is not available.');
  }

  // Attempt silent re-auth first (no popup if the Google session cookie is still valid).
  // If interaction is required, the error_callback configured in initTokenClient will
  // automatically fall back to requestAccessToken({ prompt: 'consent' }).
  tokenClient.requestAccessToken({ prompt: 'none' });

  return {
    shouldReauthenticate: true,
    notice: 'Su sesión ha expirado. Por favor, confirme su cuenta de Google en la ventana emergente para finalizar la sincronización.',
  };
}
