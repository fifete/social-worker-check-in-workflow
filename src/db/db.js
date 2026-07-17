import { openDB } from 'idb';

const DB_NAME = 'AsistenciaDB';
const DB_VERSION = 2;

let dbPromise = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // v1 used visitorId as keyPath; v2 uses recordId to allow the same
        // visitor (same DNI) to appear multiple times for different adolescents.
        if (oldVersion < 2 && db.objectStoreNames.contains('visitorStore')) {
          db.deleteObjectStore('visitorStore');
        }

        if (!db.objectStoreNames.contains('visitorStore')) {
          const visitorStore = db.createObjectStore('visitorStore', {
            keyPath: 'recordId',
          });
          visitorStore.createIndex('by_visitor', 'visitorId', { unique: false });
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
