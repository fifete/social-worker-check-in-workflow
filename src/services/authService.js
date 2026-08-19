import * as visitorService from './visitorService.js';

export const TOKEN_EXPIRY_MS    = 3_600_000; // Google hard expiry (1 hour)
export const TOKEN_SAFE_WINDOW_MS = 3_000_000; // 50-minute safety threshold

let tokenClient = null;

// Pending sign-in promise handles — resolved/rejected from handleTokenResponse
let _resolveSignIn = null;
let _rejectSignIn  = null;

/**
 * Initializes the GIS token client. Must be called once after the GIS script loads.
 * Throws synchronously if called before window.google is available.
 */
export function initAuth() {
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    scope:
      'https://www.googleapis.com/auth/drive.file ' +
      'https://www.googleapis.com/auth/spreadsheets',
    callback: (response) => {
      _handleTokenCallback(response);
    },
    prompt: '',
  });
}

/**
 * Internal callback handler — not exported.
 */
async function _handleTokenCallback(response) {
  if (response.error) {
    const code =
      response.error === 'popup_closed_by_user' ||
      response.error === 'access_denied'
        ? 'AUTH_CANCELLED'
        : { code: 'AUTH_FAILED', detail: response.error };

    const err =
      typeof code === 'string' ? { code } : code;

    _rejectSignIn?.(err);
    _resolveSignIn = null;
    _rejectSignIn  = null;
    return;
  }

  try {
    let existing = null;
    try {
      existing = await visitorService.readSession();
    } catch {
      // treat as no existing session; proceed
    }

    await visitorService.writeSession({
      accessToken:   response.access_token,
      tokenIssuedAt: Date.now(),
      // Never overwrite refreshToken with undefined
      refreshToken:  response.refresh_token ?? existing?.refreshToken ?? null,
    });

    _resolveSignIn?.();
  } catch {
    _rejectSignIn?.({ code: 'SESSION_WRITE_FAILED' });
  } finally {
    _resolveSignIn = null;
    _rejectSignIn  = null;
  }
}

/**
 * Opens the GIS authorization popup. Must be called from a user-gesture handler.
 * @returns {Promise<void>}
 */
export function requestSignIn() {
  return new Promise((resolve, reject) => {
    _resolveSignIn = resolve;
    _rejectSignIn  = reject;
    try {
      tokenClient.requestAccessToken({ prompt: '' });
    } catch (err) {
      // Synchronous throw can indicate popup blocking in some environments
      _resolveSignIn = null;
      _rejectSignIn  = null;
      reject({ code: 'POPUP_BLOCKED' });
    }
  });
}

/**
 * Re-opens the GIS popup to obtain a fresh token. Used by syncService before pushing data.
 * @returns {Promise<void>}
 */
export function reAuthenticate() {
  return new Promise((resolve, reject) => {
    _resolveSignIn = resolve;
    _rejectSignIn  = reject;
    try {
      tokenClient.requestAccessToken({ prompt: '' });
    } catch {
      _resolveSignIn = null;
      _rejectSignIn  = null;
      reject({ code: 'AUTH_FAILED', detail: 'requestAccessToken threw synchronously' });
    }
  });
}

/**
 * Returns true if the stored token is within the 50-minute safety window.
 * Returns false if no session exists or IDB throws.
 * @returns {Promise<boolean>}
 */
export async function isTokenValid() {
  try {
    const session = await visitorService.readSession();
    if (!session || !session.tokenIssuedAt) return false;
    return (Date.now() - session.tokenIssuedAt) < TOKEN_SAFE_WINDOW_MS;
  } catch {
    return false;
  }
}

/**
 * Returns the stored access token string, or null if absent or IDB throws.
 * Does not check token validity.
 * @returns {Promise<string|null>}
 */
export async function getAccessToken() {
  try {
    const session = await visitorService.readSession();
    return session?.accessToken ?? null;
  } catch {
    return null;
  }
}
