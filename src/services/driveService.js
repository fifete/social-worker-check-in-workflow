import { getAccessToken } from './authService.js';

const DRIVE_FILES_BASE  = 'https://www.googleapis.com/drive/v3/files';
const SHEETS_BASE       = 'https://sheets.googleapis.com/v4/spreadsheets';
// Hardcoded tab name — must not be parameterized (per spec)
const SHEET_TAB         = 'Respuestas de formulario 1';
const SHEET_TAB_ENCODED = encodeURIComponent(SHEET_TAB);

async function authHeaders() {
  const token = await getAccessToken();
  if (!token) throw { code: 'NO_TOKEN' };
  return { Authorization: `Bearer ${token}` };
}

/**
 * Searches Drive for an existing file named `{masterFileName}_ASISTENCIA`.
 * Returns the first match or null.
 * @param {string} masterFileName
 * @returns {Promise<{id: string, name: string}|null>}
 */
export async function searchForAsistenciaFile(masterFileName) {
  const headers = await authHeaders();
  const q = encodeURIComponent(`name='${masterFileName}_ASISTENCIA' and trashed=false`);
  const url = `${DRIVE_FILES_BASE}?q=${q}&fields=files(id,name)&corpora=user`;

  let response;
  try {
    response = await fetch(url, { headers });
  } catch {
    throw { code: 'SEARCH_NETWORK_ERROR' };
  }

  if (!response.ok) {
    if (response.status === 401) throw { code: 'SEARCH_UNAUTHORIZED' };
    if (response.status === 403) throw { code: 'SEARCH_FORBIDDEN' };
    throw { code: 'SEARCH_API_ERROR' };
  }

  const data = await response.json();
  return data.files?.length > 0 ? data.files[0] : null;
}

/**
 * Deletes an orphaned _ASISTENCIA file from Drive.
 * @param {string} fileId
 */
export async function deleteFile(fileId) {
  const headers = await authHeaders();

  let response;
  try {
    response = await fetch(`${DRIVE_FILES_BASE}/${fileId}`, {
      method: 'DELETE',
      headers,
    });
  } catch {
    throw { code: 'DELETE_NETWORK_ERROR' };
  }

  if (response.status === 204) return; // success

  if (response.status === 401) throw { code: 'DELETE_UNAUTHORIZED' };
  if (response.status === 403) throw { code: 'DELETE_FORBIDDEN' };
  if (response.status === 404) throw { code: 'DELETE_NOT_FOUND' };
  throw { code: 'DELETE_API_ERROR' };
}

/**
 * Copies the master spreadsheet to a new `{masterFileName}_ASISTENCIA` working copy.
 * @param {string} masterFileId
 * @param {string} masterFileName
 * @returns {Promise<{workingFileId: string}>}
 */
export async function copyMasterFile(masterFileId, masterFileName) {
  const headers = await authHeaders();

  let response;
  try {
    response = await fetch(`${DRIVE_FILES_BASE}/${masterFileId}/copy`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `${masterFileName}_ASISTENCIA` }),
    });
  } catch {
    throw { code: 'COPY_NETWORK_ERROR' };
  }

  if (!response.ok) {
    if (response.status === 401) throw { code: 'COPY_UNAUTHORIZED' };
    if (response.status === 403) throw { code: 'COPY_FORBIDDEN' };
    if (response.status === 404) throw { code: 'COPY_NOT_FOUND' };
    throw { code: 'COPY_API_ERROR' };
  }

  const data = await response.json();
  return { workingFileId: data.id };
}

/**
 * Reads all rows from the working copy spreadsheet.
 * Returns raw string[][] where row 0 is the header.
 * @param {string} workingFileId
 * @returns {Promise<string[][]>}
 */
export async function fetchSheetData(workingFileId) {
  const headers = await authHeaders();
  const url = `${SHEETS_BASE}/${workingFileId}/values/${SHEET_TAB_ENCODED}`;

  let response;
  try {
    response = await fetch(url, { headers });
  } catch {
    throw { code: 'FETCH_NETWORK_ERROR' };
  }

  if (!response.ok) {
    if (response.status === 401) throw { code: 'FETCH_UNAUTHORIZED' };
    if (response.status === 403) throw { code: 'FETCH_FORBIDDEN' };
    if (response.status === 404) throw { code: 'FETCH_NOT_FOUND' };
    throw { code: 'FETCH_API_ERROR' };
  }

  const data = await response.json();
  return data.values ?? [];
}

/**
 * Writes attendance values to the ASISTENCIA column via batchUpdate.
 * @param {string} workingFileId
 * @param {Array<{rowIndex: number, columnLetter: string}>} updates
 */
export async function batchUpdateAttendance(workingFileId, updates) {
  const headers = await authHeaders();
  const url = `${SHEETS_BASE}/${workingFileId}/values:batchUpdate`;

  // Always write the header to row 1 — idempotent if column existed, creates it if appended
  const data = [
    { range: `${SHEET_TAB}!${updates[0].columnLetter}1`, values: [['ASISTENCIA']] },
    ...updates.map(({ rowIndex, columnLetter }) => ({
      range:  `${SHEET_TAB}!${columnLetter}${rowIndex}`,
      values: [['Si']],
    })),
  ];

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ valueInputOption: 'RAW', data }),
    });
  } catch {
    throw { code: 'BATCH_NETWORK_ERROR' };
  }

  if (response.ok) return; // HTTP 200 — success

  if (response.status === 401) throw { code: 'BATCH_UNAUTHORIZED' };
  if (response.status === 403) throw { code: 'BATCH_FORBIDDEN' };
  if (response.status === 429) throw { code: 'BATCH_RATE_LIMITED' };
  if (response.status >= 500)  throw { code: 'BATCH_SERVER_ERROR' };
  throw { code: 'BATCH_API_ERROR' };
}
