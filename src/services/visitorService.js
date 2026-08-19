import { openDatabase } from '../db/db.js';

// Column header → schema key mapping (exact strings from index.md)
const COLUMN_MAP = {
  'NOAPELLIDOS Y NOMBRES COMPLETOS DEL ADOLESCENTE (MAYÚSCULA)': 'hostName',
  'DOCUMENTO DE IDENTIDAD DEL ADOLESCENTE':                       'hostId',
  'APELLIDOS Y NOMBRES COMPLETOS DEL VISITANTE (MAYÚSCULA)':      'visitorName',
  'DOCUMENTO DE IDENTIDAD DEL VISITANTE':                         'visitorId',
  'EDAD DEL VISITANTE':                                           'visitorAge',
  'PARENTESCO CON EL ADOLESCENTE':                               'relationship',
  'TIPO DE VISITA':                                               'visitType',
  'DEPARTAMENTO DE RESIDENCIA DEL VISITANTE':                    'location.dept',
  'PROVINCIA DE RESIDENCIA DEL VISITANTE':                       'location.prov',
  'DISTRITO DE RESIDENCIA DEL VISITANTE':                        'location.dist',
};

const REQUIRED_KEYS = new Set(['visitorId', 'visitorName']);

// Convert zero-based column index to spreadsheet letter (A, B, … Z, AA, AB, …)
function colIndexToLetter(index) {
  let result = '';
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

function normalize(str) {
  return String(str ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// ---------------------------------------------------------------------------
// openDatabase — see db.js
// ---------------------------------------------------------------------------

/**
 * Parses spreadsheet rows and writes all visitor records to visitorStore in a
 * single transaction. Also writes asistenciaColumn to sessionStateStore.
 * @param {string[][]} rawRows  Row 0 must be the header row.
 */
export async function hydrateFromRows(rawRows) {
  if (!rawRows || rawRows.length < 2) return;

  const headerRow = rawRows[0];

  // Build column index lookup
  const colIndex = {};
  for (let c = 0; c < headerRow.length; c++) {
    const header = headerRow[c];
    if (header in COLUMN_MAP) {
      colIndex[COLUMN_MAP[header]] = c;
    }
  }

  // Validate required columns
  for (const key of REQUIRED_KEYS) {
    if (!(key in colIndex)) {
      throw { code: 'HEADER_PARSE_FAILED' };
    }
  }

  // Determine ASISTENCIA column letter
  const asistenciaHeaderIdx = headerRow.indexOf('ASISTENCIA');
  const asistenciaColumn = asistenciaHeaderIdx !== -1
    ? colIndexToLetter(asistenciaHeaderIdx)
    : colIndexToLetter(headerRow.length); // append after last column

  // Write asistenciaColumn into session (non-blocking to the main hydration tx)
  await writeSession({ asistenciaColumn });

  // Map and write all visitor records in one transaction
  const db = await openDatabase();
  const tx = db.transaction('visitorStore', 'readwrite');
  const store = tx.objectStore('visitorStore');

  try {
    for (let i = 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      const get = (key) => row[colIndex[key]] ?? '';

      const record = {
        visitorId:          get('visitorId'),
        visitorName:        get('visitorName'),
        visitorAge:         get('visitorAge'),
        relationship:       get('relationship'),
        hostName:           get('hostName'),
        hostId:             get('hostId'),
        visitType:          get('visitType'),
        location: {
          dept: get('location.dept'),
          prov: get('location.prov'),
          dist: get('location.dist'),
        },
        attendanceStatus:    false,
        attendanceTimestamp: null,
        syncedWithCloud:     false,
        rowIndex:            i + 1, // 1-based sheet row; row 1 is header, data starts at 2
      };

      store.put(record); // fire without awaiting each; let transaction batch
    }

    await tx.done;
  } catch {
    // Attempt to clear any partial writes before rejecting
    try {
      const clearTx = db.transaction('visitorStore', 'readwrite');
      await clearTx.objectStore('visitorStore').clear();
      await clearTx.done;
    } catch {
      // best-effort; ignore secondary failure
    }
    throw { code: 'HYDRATION_FAILED' };
  }
}

/**
 * Diacritic-insensitive substring search against visitorName and visitorId.
 * Caller must ensure query.length >= 3. Caller applies the 15-result display cap.
 * @param {string} query
 * @returns {Promise<object[]>}
 */
export async function searchVisitors(query) {
  const normalizedQuery = normalize(query);
  const db = await openDatabase();

  try {
    const tx = db.transaction('visitorStore', 'readonly');
    const store = tx.objectStore('visitorStore');
    const results = [];

    let cursor = await store.openCursor();
    while (cursor) {
      const r = cursor.value;
      if (
        normalize(r.visitorName).includes(normalizedQuery) ||
        normalize(r.visitorId).includes(normalizedQuery)
      ) {
        results.push(r);
      }
      cursor = await cursor.continue();
    }

    return results;
  } catch {
    throw { code: 'SEARCH_FAILED' };
  }
}

/**
 * Fetches a single visitor record by primary key (DNI).
 * @param {string} visitorId
 * @returns {Promise<object|null>}
 */
export async function getVisitorById(visitorId) {
  const db = await openDatabase();
  try {
    const record = await db.get('visitorStore', visitorId);
    return record ?? null;
  } catch {
    throw { code: 'GET_FAILED' };
  }
}

/**
 * Marks a visitor as attended. Does not modify rowIndex or other immutable fields.
 * @param {string} visitorId
 */
export async function recordAttendance(visitorId) {
  const db = await openDatabase();
  const tx = db.transaction('visitorStore', 'readwrite');
  const store = tx.objectStore('visitorStore');

  try {
    const existing = await store.get(visitorId);
    if (!existing) throw { code: 'RECORD_NOT_FOUND' };

    store.put({
      ...existing,
      attendanceStatus:    true,
      attendanceTimestamp: new Date().toISOString(),
      syncedWithCloud:     false,
    });

    await tx.done;
  } catch (err) {
    if (err && err.code === 'RECORD_NOT_FOUND') throw err;
    throw { code: 'ATTENDANCE_WRITE_FAILED' };
  }
}

/**
 * Clears attendance for a visitor.
 * @param {string} visitorId
 */
export async function undoAttendance(visitorId) {
  const db = await openDatabase();
  const tx = db.transaction('visitorStore', 'readwrite');
  const store = tx.objectStore('visitorStore');

  try {
    const existing = await store.get(visitorId);
    if (!existing) throw { code: 'RECORD_NOT_FOUND' };

    store.put({
      ...existing,
      attendanceStatus:    false,
      attendanceTimestamp: null,
      syncedWithCloud:     false,
    });

    await tx.done;
  } catch (err) {
    if (err && err.code === 'RECORD_NOT_FOUND') throw err;
    throw { code: 'UNDO_WRITE_FAILED' };
  }
}

/**
 * Returns all records where attendanceStatus === true AND syncedWithCloud === false.
 * @returns {Promise<object[]>}
 */
export async function getPendingSyncRecords() {
  const db = await openDatabase();

  try {
    const tx = db.transaction('visitorStore', 'readonly');
    const store = tx.objectStore('visitorStore');
    const results = [];

    let cursor = await store.openCursor();
    while (cursor) {
      const r = cursor.value;
      if (r.attendanceStatus === true && r.syncedWithCloud === false) {
        results.push(r);
      }
      cursor = await cursor.continue();
    }

    return results;
  } catch {
    throw { code: 'PENDING_QUERY_FAILED' };
  }
}

/**
 * Deletes all records from visitorStore.
 */
export async function clearVisitorStore() {
  const db = await openDatabase();
  const tx = db.transaction('visitorStore', 'readwrite');
  try {
    await tx.objectStore('visitorStore').clear();
    await tx.done;
  } catch {
    throw { code: 'CLEAR_VISITOR_FAILED' };
  }
}

/**
 * Reads the CURRENT_SESSION record. Returns null if absent.
 * @returns {Promise<object|null>}
 */
export async function readSession() {
  const db = await openDatabase();
  try {
    const record = await db.get('sessionStateStore', 'CURRENT_SESSION');
    return record ?? null;
  } catch {
    throw { code: 'READ_SESSION_FAILED' };
  }
}

/**
 * Writes or merges into the CURRENT_SESSION record.
 * Always preserves fields not present in sessionData.
 * @param {Partial<object>} sessionData
 */
export async function writeSession(sessionData) {
  const db = await openDatabase();
  const tx = db.transaction('sessionStateStore', 'readwrite');
  const store = tx.objectStore('sessionStateStore');

  try {
    let existing = null;
    try {
      existing = await store.get('CURRENT_SESSION');
    } catch {
      // treat read failure as no existing record
    }

    store.put({
      ...(existing ?? {}),
      ...sessionData,
      sessionId: 'CURRENT_SESSION',
    });

    await tx.done;
  } catch {
    throw { code: 'WRITE_SESSION_FAILED' };
  }
}

/**
 * Clears the sessionStateStore (deletes CURRENT_SESSION).
 */
export async function clearSessionStore() {
  const db = await openDatabase();
  const tx = db.transaction('sessionStateStore', 'readwrite');
  try {
    await tx.objectStore('sessionStateStore').clear();
    await tx.done;
  } catch {
    throw { code: 'CLEAR_SESSION_FAILED' };
  }
}

/**
 * Returns the count of records in visitorStore. Returns 0 on error.
 */
export async function countVisitors() {
  const db = await openDatabase();
  try {
    return await db.count('visitorStore');
  } catch {
    return 0;
  }
}
