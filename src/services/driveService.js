import { getValidToken } from './authService.js';
import { getDB } from '../db/db.js';
import { seedMockVisitors } from './visitorService.js';

const TAB_NAME = "'Respuestas de formulario 1'";

// Maps internal field names to their exact spreadsheet column header strings
const COLUMN_HEADERS = {
  visitorId:   'DOCUMENTO DE IDENTIDAD DEL VISITANTE',
  visitorName: 'APELLIDOS Y NOMBRES COMPLETOS DEL VISITANTE (MAYÚSCULA)',
  hostName:    'APELLIDOS Y NOMBRES COMPLETOS DEL ADOLESCENTE (MAYÚSCULA)',
  hostId:      'DOCUMENTO DE IDENTIDAD DEL ADOLESCENTE',
  visitorAge:  'EDAD DEL VISITANTE',
  relationship:'PARENTESCO CON EL ADOLESCENTE',
  visitType:   'TIPO DE VISITA',
  visitorDept: 'DEPARTAMENTO DE RESIDENCIA DEL VISITANTE',
  visitorProv: 'PROVINCIA DE RESIDENCIA DEL VISITANTE',
  visitorDist: 'DISTRITO DE RESIDENCIA DEL VISITANTE',
};

// Scans up to the first 5 rows to find the row that contains the actual column
// headers, skipping any banner or title rows that appear above the data.
function findHeaderRowIndex(rowsArray) {
  const knownHeaders = Object.values(COLUMN_HEADERS).map((h) => h.toUpperCase());
  for (let i = 0; i < Math.min(rowsArray.length, 5); i++) {
    const candidate = rowsArray[i].map((h) => String(h).trim().toUpperCase());
    if (knownHeaders.some((h) => candidate.includes(h))) return i;
  }
  return 0;
}

export function indexToColumnLetter(index) {
  let result = '';
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

export async function cloneMasterSpreadsheet(masterFileId, masterFileName) {
  const token = await getValidToken();

  if (!token) {
    return { status: 'AUTH_REQUIRED', message: 'Sesión expirada. Confirme su cuenta.' };
  }

  // Strip file extension and append _ASISTENCIA
  const baseName = masterFileName.replace(/\.[^/.]+$/, '');
  const cloneName = `${baseName}_ASISTENCIA`;

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(masterFileId)}/copy`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: cloneName }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error?.message ?? `Drive clone failed with status ${response.status}`);
  }

  const data = await response.json();
  return data.id;
}

export async function fetchSpreadsheetData(workingFileId, range = "'Respuestas de formulario 1'!A:Z") {
  const token = await getValidToken();

  if (!token) {
    return { status: 'AUTH_REQUIRED', message: 'Sesión expirada. Confirme su cuenta.' };
  }

  const encodedRange = encodeURIComponent(range);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(workingFileId)}/values/${encodedRange}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      errorBody.error?.message ?? `Sheets fetch failed with status ${response.status}`,
    );
  }

  const data = await response.json();
  return data.values ?? [];
}

export async function ensureAttendanceColumn(workingFileId, rowsArray) {
  if (!rowsArray || rowsArray.length < 1) return rowsArray;

  const headerRowIndex = findHeaderRowIndex(rowsArray);
  const upperHeaders = rowsArray[headerRowIndex].map((h) => String(h).trim().toUpperCase());
  if (upperHeaders.includes('ASISTENCIA')) return rowsArray;

  // Use the widest row to find the true last column across ALL rows.
  const maxColumns = rowsArray.reduce((max, row) => Math.max(max, row.length), 0);

  const applyInMemory = (arr) =>
    arr.map((row, i) => {
      if (i === headerRowIndex) return [...row, 'ASISTENCIA'];
      if (i > headerRowIndex) return [...row, 'FALSE'];
      return row; // leave title rows above the header untouched
    });

  // Skip API call for mock/dev file IDs
  if (!workingFileId || String(workingFileId).startsWith('mock')) {
    return applyInMemory(rowsArray);
  }

  const token = await getValidToken();
  if (!token) return rowsArray;

  const colLetter = indexToColumnLetter(maxColumns);
  // Write ASISTENCIA header at the header row, then FALSE for every data row below it.
  const startRow = headerRowIndex + 1; // 1-based sheet row
  const endRow = rowsArray.length;
  const values = [['ASISTENCIA'], ...Array(endRow - startRow).fill(['FALSE'])];
  const range = encodeURIComponent(`${TAB_NAME}!${colLetter}${startRow}:${colLetter}${endRow}`);

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(workingFileId)}/values/${range}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      errorBody.error?.message ?? `Failed to write ASISTENCIA column: ${response.status}`,
    );
  }

  return applyInMemory(rowsArray);
}

export async function ingestRowsToIndexedDB(rowsArray, masterFileId, workingFileId) {
  if (!rowsArray || rowsArray.length < 2) return;

  // Ensure the ASISTENCIA column exists in the working spreadsheet
  const rows = await ensureAttendanceColumn(workingFileId, rowsArray);

  // Locate the actual header row (skip any banner/title rows above it)
  const headerRowIndex = findHeaderRowIndex(rows);

  // Build a column-index lookup from the header row (case-insensitive)
  const headerRow = rows[headerRowIndex].map((h) => String(h).trim().toUpperCase());
  const colIndex = {};
  for (const [field, header] of Object.entries(COLUMN_HEADERS)) {
    colIndex[field] = headerRow.indexOf(header.toUpperCase());
  }

  // Fallback: if some headers are missing (e.g. no text in those cells),
  // derive positions relative to the hostName anchor column.
  if (colIndex.visitorId === -1 && colIndex.hostName !== -1) {
    const anchor = colIndex.hostName;
    colIndex.hostId       = anchor + 1;
    colIndex.visitorName  = anchor + 2;
    colIndex.visitorId    = anchor + 3;
    colIndex.visitorAge   = anchor + 4;
    colIndex.relationship = anchor + 5;
    colIndex.visitType    = anchor + 6;
    colIndex.visitorDept  = anchor + 7;
    colIndex.visitorProv  = anchor + 8;
    colIndex.visitorDist  = anchor + 9;
    console.warn('[ingest] Incomplete header row — using position-based fallback from hostName anchor at index', anchor);
  }

  if (colIndex.visitorId === -1) {
    const found = rows[headerRowIndex].map((h, i) => `[${i}]="${h}"`).join(', ');
    throw new Error(
      `Columna requerida no encontrada: "${COLUMN_HEADERS.visitorId}". ` +
      `Encabezados encontrados en fila ${headerRowIndex + 1}: ${found}. ` +
      `Verifique que el archivo tiene el formato correcto.`
    );
  }

  const getCell = (row, field) => {
    const idx = colIndex[field];
    return idx !== -1 && idx < row.length ? String(row[idx] ?? '').trim() : '';
  };

  // Data starts on the row after the header row
  const dataRows = rows.slice(headerRowIndex + 1);

  const mappedVisitors = dataRows
    .map((row, i) => {
      const visitorId = getCell(row, 'visitorId');
      // Calculate sheetRowIndex BEFORE filtering so empty rows don't skew the count
      const sheetRowIndex = headerRowIndex + i + 2; // 1-based sheet row number
      return {
        recordId:            `${visitorId}_${sheetRowIndex}`,
        visitorId,
        visitorName:         getCell(row, 'visitorName').toUpperCase(),
        hostName:            getCell(row, 'hostName').toUpperCase() || 'NO ASIGNADO',
        hostId:              getCell(row, 'hostId'),
        visitorAge:          getCell(row, 'visitorAge'),
        relationship:        getCell(row, 'relationship').toUpperCase() || 'GENERAL',
        visitType:           getCell(row, 'visitType'),
        visitorDept:         getCell(row, 'visitorDept'),
        visitorProv:         getCell(row, 'visitorProv'),
        visitorDist:         getCell(row, 'visitorDist'),
        sheetRowIndex,
        attendanceStatus:    false,
        attendanceTimestamp: null,
        syncedWithCloud:     false,
      };
    })
    .filter((visitor) => visitor.visitorId.length > 0);

  await seedMockVisitors(mappedVisitors);

  if (masterFileId !== undefined || workingFileId !== undefined) {
    const db = await getDB();
    const tx = db.transaction(['sessionStateStore'], 'readwrite');
    const store = tx.objectStore('sessionStateStore');
    const session = await store.get('CURRENT_SESSION');

    if (session) {
      await store.put({
        ...session,
        masterFileId: masterFileId ?? session.masterFileId,
        workingFileId: workingFileId ?? session.workingFileId,
      });
    }

    await tx.done;
  }
}
