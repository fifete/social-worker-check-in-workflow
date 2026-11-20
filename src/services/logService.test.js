import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

// Fake of the Sentry SDK boundary: captureEvent runs the configured beforeSend, records
// the payload, then reports the outcome through the client's afterSendEvent hook.
const sentry = vi.hoisted(() => ({
  options: null,
  hooks: [],
  sent: [],
  respond: () => ({ statusCode: 200 }),
  count: 0,
}));

vi.mock('@sentry/browser', () => ({
  init(options) {
    sentry.options = options;
  },
  getClient() {
    return sentry.options
      ? { on: (hook, cb) => hook === 'afterSendEvent' && sentry.hooks.push(cb) }
      : undefined;
  },
  captureEvent(event) {
    const id = `evt${++sentry.count}`;
    const processed = sentry.options.beforeSend({ ...event, event_id: id });
    sentry.sent.push(processed);
    const response = sentry.respond(processed);
    if (response !== 'hang') {
      setTimeout(() => sentry.hooks.forEach((cb) => cb(processed, response)), 0);
    }
    return id;
  },
}));

const DSN = 'https://key@o1.ingest.us.sentry.io/1';

let log;
let visitorService;

async function storedEntries() {
  const { openDatabase } = await import('../db/db.js');
  return (await openDatabase()).getAll('logStore');
}

beforeEach(async () => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  sentry.options = null;
  sentry.hooks = [];
  sentry.sent = [];
  sentry.count = 0;
  sentry.respond = () => ({ statusCode: 200 });
  log = await import('./logService.js');
  visitorService = await import('./visitorService.js');
  log.initLog(DSN);
});

describe('flushLog', () => {
  it('sends a buffered entry with its original timestamp and deletes it on a 2xx', async () => {
    await log.logEvent({
      name: 'attendance.register.failed',
      state: 'attendance',
      code: 'ATTENDANCE_WRITE_FAILED',
      rowIndex: 7,
      timestamp: '2026-05-01T10:00:00.000Z',
    });

    await log.flushLog();

    expect(sentry.sent).toHaveLength(1);
    expect(sentry.sent[0].message).toBe('attendance.register.failed');
    expect(sentry.sent[0].timestamp).toBe(Date.parse('2026-05-01T10:00:00.000Z') / 1000);
    expect(sentry.sent[0].tags).toMatchObject({ code: 'ATTENDANCE_WRITE_FAILED', state: 'attendance' });
    expect(sentry.sent[0].extra).toMatchObject({ rowIndex: 7 });
    expect(await storedEntries()).toHaveLength(0);
  });

  it('sends entries oldest first', async () => {
    await log.logEvent({ name: 'attendance.register.failed', state: 'attendance', code: 'A', rowIndex: 1 });
    await log.logEvent({ name: 'attendance.undo.failed', state: 'attendance', code: 'B', rowIndex: 2 });

    await log.flushLog();

    expect(sentry.sent.map((e) => e.tags.code)).toEqual(['A', 'B']);
  });

  it.each([
    ['a network error', {}],
    ['a 429', { statusCode: 429 }],
    ['a 500', { statusCode: 500 }],
  ])('keeps the entry after %s', async (_label, response) => {
    sentry.respond = () => response;
    await log.logEvent({ name: 'sync.batch.failed', state: 'sync', code: 'SYNC_API_ERROR' });

    await log.flushLog();

    expect(await storedEntries()).toHaveLength(1);
  });

  it('keeps an entry rejected with a 4xx and adds one log.flush.rejected entry, only once', async () => {
    sentry.respond = (event) =>
      event.message === 'log.flush.rejected' ? { statusCode: 200 } : { statusCode: 413 };
    await log.logEvent({ name: 'sync.batch.failed', state: 'sync', code: 'SYNC_API_ERROR' });

    await log.flushLog();
    await log.flushLog();
    await log.flushLog();

    const names = (await storedEntries()).map((e) => e.name);
    expect(names).toEqual(['sync.batch.failed']);
    expect(sentry.sent.filter((e) => e.message === 'log.flush.rejected')).toHaveLength(1);
  });

  it('returns within the timeout when Sentry never answers, keeping the entries', async () => {
    sentry.respond = () => 'hang';
    await log.logEvent({ name: 'sync.batch.failed', state: 'sync', code: 'SYNC_API_ERROR' });

    const started = Date.now();
    await log.flushLog({ timeoutMs: 50 });

    expect(Date.now() - started).toBeLessThan(1000);
    expect(await storedEntries()).toHaveLength(1);
  });

  it('keeps the entries and does not throw when Sentry is not configured', async () => {
    sentry.options = null;
    await log.logEvent({ name: 'sync.batch.failed', state: 'sync', code: 'SYNC_API_ERROR' });

    await expect(log.flushLog()).resolves.toBeUndefined();
    expect(await storedEntries()).toHaveLength(1);
  });
});

describe('the log store and the purge', () => {
  it('survives clearing the visitor and session stores and the session reset', async () => {
    await log.logEvent({ name: 'sync.purge.failed', state: 'sync', code: 'PURGE_FAILED' });

    await visitorService.clearVisitorStore();
    await visitorService.clearSessionStore();
    await visitorService.resetSession();

    expect(await storedEntries()).toHaveLength(1);
  });
});

describe('sendDirect', () => {
  it('sends a Setup event straight to Sentry without buffering it', async () => {
    await log.sendDirect({ name: 'setup.load.failed', state: 'setup', code: 'FETCH_API_ERROR' });

    expect(sentry.sent.map((e) => e.message)).toEqual(['setup.load.failed']);
    expect(await storedEntries()).toHaveLength(0);
  });
});

describe('personal data', () => {
  it('sends the DNI only in its own field, for a failed record', async () => {
    await log.logEvent({
      name: 'attendance.register.failed',
      state: 'attendance',
      code: 'ATTENDANCE_WRITE_FAILED',
      rowIndex: 3,
      dni: '12345678',
    });

    await log.flushLog();

    expect(sentry.sent[0].extra.dni).toBe('12345678');
    expect(JSON.stringify({ ...sentry.sent[0], extra: { ...sentry.sent[0].extra, dni: undefined } })).not.toContain(
      '12345678'
    );
  });

  it('drops anything else that looks like a DNI and sends no IP address', () => {
    const scrubbed = sentry.options.beforeSend({
      message: 'failed for 87654321',
      request: { url: 'https://example.test/visitor/87654321' },
      extra: { dni: '12345678', note: 'dni 87654321' },
    });

    expect(JSON.stringify({ ...scrubbed, extra: { ...scrubbed.extra, dni: undefined } })).not.toContain('87654321');
    expect(scrubbed.extra.dni).toBe('12345678');
    expect(sentry.options.sendDefaultPii).toBe(false);
  });
});
