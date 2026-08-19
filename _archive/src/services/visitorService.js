import { getDB } from '../db/db.js';

const DEFAULT_VISITOR_PROPERTIES = {
  attendanceStatus: false,
  attendanceTimestamp: null,
  syncedWithCloud: false,
};

function withDefaults(visitor) {
  return {
    ...DEFAULT_VISITOR_PROPERTIES,
    ...visitor,
  };
}

export async function seedMockVisitors(mockArray = []) {
  const db = await getDB();
  const tx = db.transaction(['visitorStore'], 'readwrite');
  const store = tx.objectStore('visitorStore');

  await store.clear();

  for (const visitor of mockArray) {
    await store.put(withDefaults(visitor));
  }

  await tx.done;
}

export async function getAllVisitors() {
  const db = await getDB();
  const tx = db.transaction(['visitorStore'], 'readonly');
  const store = tx.objectStore('visitorStore');

  return store.getAll();
}

export async function getVisitorsByDni(visitorId) {
  const db = await getDB();
  const tx = db.transaction(['visitorStore'], 'readonly');
  const store = tx.objectStore('visitorStore');
  return store.index('by_visitor').getAll(visitorId);
}

export async function registerAttendance(recordId) {
  const db = await getDB();
  const tx = db.transaction(['visitorStore'], 'readwrite');
  const store = tx.objectStore('visitorStore');
  const visitor = await store.get(recordId);

  if (!visitor) {
    throw new Error(`Visitor not found: ${recordId}`);
  }

  const updatedVisitor = {
    ...visitor,
    attendanceStatus: true,
    attendanceTimestamp: new Date().toISOString(),
    syncedWithCloud: false,
  };

  await store.put(updatedVisitor);
  await tx.done;

  return updatedVisitor;
}

export async function undoAttendance(recordId) {
  const db = await getDB();
  const tx = db.transaction(['visitorStore'], 'readwrite');
  const store = tx.objectStore('visitorStore');
  const visitor = await store.get(recordId);

  if (!visitor) {
    throw new Error(`Visitor not found: ${recordId}`);
  }

  const updatedVisitor = {
    ...visitor,
    attendanceStatus: false,
    attendanceTimestamp: null,
  };

  await store.put(updatedVisitor);
  await tx.done;

  return updatedVisitor;
}

export async function clearAllStores() {
  const db = await getDB();
  const tx = db.transaction(['visitorStore', 'sessionStateStore'], 'readwrite');

  await Promise.all([
    tx.objectStore('visitorStore').clear(),
    tx.objectStore('sessionStateStore').clear(),
  ]);

  await tx.done;
}
