import { openDB } from 'idb';

const DB_NAME = 'AsistenciaDB';
const DB_VERSION = 1;

let dbPromise = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('visitorStore')) {
          const visitorStore = db.createObjectStore('visitorStore', {
            keyPath: 'visitorId',
          });

          visitorStore.createIndex('by_name', 'visitorName', { unique: false });
          visitorStore.createIndex('by_status', 'attendanceStatus', { unique: false });
        }

        if (!db.objectStoreNames.contains('sessionStateStore')) {
          db.createObjectStore('sessionStateStore', {
            keyPath: 'sessionId',
          });
        }
      },
    });
  }

  return dbPromise;
}

export default getDB;
