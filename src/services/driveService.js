import { getValidToken } from './authService.js';
import { getDB } from '../db/db.js';
import { seedMockVisitors } from './visitorService.js';

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

export async function ingestRowsToIndexedDB(rowsArray, masterFileId, workingFileId) {
  if (!rowsArray || rowsArray.length < 2) {
    return;
  }

  // Row 0 is the header; data starts at row 1
  const dataRows = rowsArray.slice(1);

  const mappedVisitors = dataRows
    .filter((row) => row[0] && String(row[0]).trim())
    .map((row) => ({
      visitorId: String(row[0]).trim(),
      visitorName: String(row[1] ?? '').trim().toUpperCase(),
      hostName: row[2] ? String(row[2]).trim().toUpperCase() : 'NO ASIGNADO',
      relationship: row[3] ? String(row[3]).trim().toUpperCase() : 'GENERAL',
      attendanceStatus: false,
      attendanceTimestamp: null,
      syncedWithCloud: false,
    }));

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
