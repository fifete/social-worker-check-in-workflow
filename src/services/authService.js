import { getDB } from '../db/db.js';

const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const TOKEN_EXPIRATION_THRESHOLD_MS = 3_500_000;
export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
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

  return window.google.accounts.oauth2.initTokenClient({
    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    scope: SCOPES,
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
}

export async function saveSessionToken(tokenResponse) {
  const accessToken = tokenResponse?.access_token;

  if (!accessToken) {
    throw new Error('A Google access token is required to persist the session.');
  }

  const db = await getDB();
  const tx = db.transaction(['sessionStateStore'], 'readwrite');
  const store = tx.objectStore('sessionStateStore');
  const sessionRecord = {
    sessionId: 'CURRENT_SESSION',
    authToken: accessToken,
    tokenAcquisitionTime: Date.now(),
    workingFileId: null,
    masterFileId: null,
  };

  await store.put(sessionRecord);
  await tx.done;

  return sessionRecord;
}

export async function getValidToken() {
  const db = await getDB();
  const tx = db.transaction(['sessionStateStore'], 'readonly');
  const store = tx.objectStore('sessionStateStore');
  const sessionRecord = await store.get('CURRENT_SESSION');

  if (!sessionRecord?.authToken) {
    return null;
  }

  const elapsedTimeMs = Date.now() - (sessionRecord.tokenAcquisitionTime ?? 0);

  if (elapsedTimeMs < TOKEN_EXPIRATION_THRESHOLD_MS) {
    return sessionRecord.authToken;
  }

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

  tokenClient.requestAccessToken({ prompt: '' });

  return {
    shouldReauthenticate: true,
    notice: 'Su sesión ha expirado. Por favor, confirme su cuenta de Google en la ventana emergente para finalizar la sincronización.',
  };
}
