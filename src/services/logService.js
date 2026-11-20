import * as Sentry from '@sentry/browser';
import { openDatabase } from '../db/db.js';

// Failure log: see docs/boxes/failure-log.md and docs/adr/0001, 0002.
// Nothing here may throw: logging must never break the app or block Sync.

export const FLUSH_TIMEOUT_MS = 5000;

const REJECTED_NAME = 'log.flush.rejected';

// Resolvers for events handed to the SDK, keyed by event id, settled by afterSendEvent.
const awaitingResponse = new Map();

// Anything that looks like a DNI (8 or more digits). Applied to every string except `extra.dni`.
const DNI_LIKE = /\b\d{8,}\b/g;

function scrub(value) {
  if (typeof value === 'string') return value.replace(DNI_LIKE, '[dni]');
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v)]));
  }
  return value;
}

function beforeSend(event) {
  const scrubbed = scrub(event);
  if (event.extra?.dni !== undefined) scrubbed.extra.dni = event.extra.dni;
  return scrubbed;
}

function beforeBreadcrumb(breadcrumb) {
  return scrub(breadcrumb);
}

/**
 * Starts the Sentry SDK with no default integrations (no breadcrumbs, no global handlers,
 * no sessions) and no default PII. Without a DSN the log still buffers, but nothing is sent.
 * @param {string} [dsn]
 */
export function initLog(dsn = import.meta.env.VITE_SENTRY_DSN) {
  if (!dsn) return;
  try {
    Sentry.init({
      dsn,
      defaultIntegrations: false,
      integrations: [],
      sendDefaultPii: false,
      beforeSend,
      beforeBreadcrumb,
    });
    Sentry.getClient()?.on('afterSendEvent', (event, response) => {
      const resolve = awaitingResponse.get(event?.event_id);
      if (!resolve) return;
      awaitingResponse.delete(event.event_id);
      resolve(response?.statusCode);
    });
  } catch (err) {
    console.error('[logService] Sentry init failed:', err?.code ?? err?.name);
  }
}

function toEvent({ name, state, code, rowIndex = null, dni, timestamp }) {
  const extra = { rowIndex };
  if (dni !== undefined) extra.dni = dni;
  return {
    message: name,
    level: 'error',
    timestamp: Date.parse(timestamp) / 1000,
    tags: { code, state },
    extra,
  };
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Buffers an Attendance or Sync entry in the log store until a flush gets Sentry's receipt.
 * `dni` is allowed only on an event about a failed record (ADR 0001).
 * @param {{name: string, state: 'setup'|'attendance'|'sync', code: string, rowIndex?: number|null, dni?: string, timestamp?: string}} entry
 */
export async function logEvent(entry) {
  try {
    const db = await openDatabase();
    await db.add('logStore', { rowIndex: null, timestamp: nowIso(), ...entry });
  } catch (err) {
    console.error('[logService] Could not buffer log entry:', err?.code ?? err?.name);
  }
}

/**
 * Sends a Setup entry straight to Sentry (Setup is online); it is not buffered.
 * @param {Parameters<typeof logEvent>[0]} entry
 */
export async function sendDirect(entry) {
  try {
    if (!Sentry.getClient()) return;
    Sentry.captureEvent(toEvent({ timestamp: nowIso(), ...entry }));
  } catch (err) {
    console.error('[logService] Could not send log entry:', err?.code ?? err?.name);
  }
}

function sendToSentry(entry) {
  return new Promise((resolve) => {
    const id = Sentry.captureEvent(toEvent(entry));
    awaitingResponse.set(id, resolve);
  });
}

const isConfirmed = (status) => status >= 200 && status < 300;
// 429 and 5xx can succeed later; any other 4xx (e.g. 413) never will.
const isRejected = (status) => status >= 400 && status < 500 && status !== 429;

async function deliver(db, entry) {
  const status = await sendToSentry(entry);

  if (isConfirmed(status)) {
    await db.delete('logStore', entry.id);
    return;
  }

  if (isRejected(status) && !entry.rejected) {
    await db.put('logStore', { ...entry, rejected: true });
    await db.add('logStore', {
      name: REJECTED_NAME,
      state: 'sync',
      code: `LOG_FLUSH_REJECTED_${status}`,
      rowIndex: null,
      timestamp: nowIso(),
      rejected: true,
    });
  }
}

async function sendAll() {
  const client = Sentry.getClient();
  if (!client) return;
  const db = await openDatabase();
  const entries = await db.getAll('logStore'); // autoincrement keys: oldest first
  await Promise.all(entries.map((entry) => deliver(db, entry).catch(() => {})));
}

/**
 * Sends the buffered entries to Sentry and deletes each one only when Sentry answered 2xx
 * for it. Resolves after at most `timeoutMs`, whatever happened; never throws.
 * @param {{timeoutMs?: number}} [options]
 */
export async function flushLog({ timeoutMs = FLUSH_TIMEOUT_MS } = {}) {
  let timer;
  try {
    await Promise.race([
      sendAll(),
      new Promise((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } catch (err) {
    console.error('[logService] Flush failed:', err?.code ?? err?.name);
  } finally {
    clearTimeout(timer);
  }
}
