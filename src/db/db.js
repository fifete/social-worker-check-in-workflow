import { openDB } from 'idb';

const DB_NAME = 'checkInDB';
const DB_VERSION = 1;

let _db = null;

/**
 * Opens (or creates) checkInDB. Rejects with { code: 'DB_OPEN_BLOCKED' } or
 * { code: 'DB_OPEN_FAILED' } on error. Must be called once before any service function.
 * @returns {Promise<import('idb').IDBPDatabase>}
 */
export function openDatabase() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    let wasBlocked = false;

    openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('visitorStore')) {
          db.createObjectStore('visitorStore', { keyPath: 'visitorId' });
        }
        if (!db.objectStoreNames.contains('sessionStateStore')) {
          db.createObjectStore('sessionStateStore', { keyPath: 'sessionId' });
        }
      },
      blocked() {
        wasBlocked = true;
        reject({ code: 'DB_OPEN_BLOCKED' });
      },
    })
      .then((db) => {
        if (!wasBlocked) {
          _db = db;
          resolve(db);
        }
      })
      .catch(() => {
        if (!wasBlocked) {
          reject({ code: 'DB_OPEN_FAILED' });
        }
      });
  });
}
