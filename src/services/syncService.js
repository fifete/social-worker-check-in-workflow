import { getValidToken, handleExpiredTokenReAuth } from './authService.js';
import { getAllVisitors } from './visitorService.js';
import { getDB } from '../db/db.js';
import { indexToColumnLetter } from './driveService.js';

const TAB_NAME = "'Respuestas de formulario 1'";

export async function executeBatchSync(tokenClient) {
  // Step 1: Query pending records
  const allVisitors = await getAllVisitors();
  const pendingRecords = allVisitors.filter(
    (record) => record.attendanceStatus === true && record.syncedWithCloud === false,
  );

  if (pendingRecords.length === 0) {
    return { status: 'UP_TO_DATE', count: 0, message: 'Todos los registros están sincronizados.' };
  }

  // Step 2: Token health check
  const token = await getValidToken();

  if (!token) {
    handleExpiredTokenReAuth(tokenClient);
    return {
      status: 'AUTH_REQUIRED',
      message: 'Sesión expirada. Confirme su cuenta para sincronizar.',
    };
  }

  // Step 3: Resolve target working file
  const db = await getDB();
  const sessionRecord = await db
    .transaction(['sessionStateStore'], 'readonly')
    .objectStore('sessionStateStore')
    .get('CURRENT_SESSION');

  const workingFileId = sessionRecord?.workingFileId;

  if (!workingFileId) {
    throw new Error('Error crítico: No se encontró el archivo de trabajo clonado.');
  }

  // Step 4: Fetch first few rows to locate the header row containing ASISTENCIA
  // (the spreadsheet may have a banner/title row before the actual header row)
  const headerRange = encodeURIComponent(`${TAB_NAME}!1:5`);
  const headerResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(workingFileId)}/values/${headerRange}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!headerResponse.ok) {
    const errorBody = await headerResponse.json().catch(() => ({}));
    throw new Error(
      errorBody.error?.message ?? `No se pudo leer el encabezado: ${headerResponse.status}`,
    );
  }

  const headerData = await headerResponse.json();
  const topRows = headerData.values ?? [];

  let asistenciaColIndex = -1;
  for (const row of topRows) {
    const upper = row.map((h) => String(h).trim().toUpperCase());
    const idx = upper.indexOf('ASISTENCIA');
    if (idx !== -1) {
      asistenciaColIndex = idx;
      break;
    }
  }

  if (asistenciaColIndex === -1) {
    throw new Error('Columna ASISTENCIA no encontrada en la hoja de trabajo.');
  }

  const asistenciaColLetter = indexToColumnLetter(asistenciaColIndex);

  // Step 5: Build batchUpdate payload — update ASISTENCIA cell for each attended row
  const validRecords = pendingRecords.filter((r) => r.sheetRowIndex != null);

  if (validRecords.length === 0) {
    return {
      status: 'UP_TO_DATE',
      count: 0,
      message: 'Los registros no contienen índice de fila. Reimporte el archivo.',
    };
  }

  const batchData = validRecords.map((record) => ({
    range: `${TAB_NAME}!${asistenciaColLetter}${record.sheetRowIndex}`,
    values: [['TRUE']],
  }));

  // Step 6: Execute batchUpdate
  const batchResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(workingFileId)}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ valueInputOption: 'RAW', data: batchData }),
    },
  );

  if (!batchResponse.ok) {
    const errorBody = await batchResponse.json().catch(() => ({}));
    throw new Error(
      errorBody.error?.message ?? `Sheets sync failed with status ${batchResponse.status}`,
    );
  }

  // Step 7: Mark records as synced locally
  const writeTx = db.transaction(['visitorStore'], 'readwrite');
  const visitorStore = writeTx.objectStore('visitorStore');

  for (const record of validRecords) {
    await visitorStore.put({ ...record, syncedWithCloud: true });
  }

  await writeTx.done;

  return {
    status: 'SUCCESS',
    count: validRecords.length,
    message: `Se sincronizaron ${validRecords.length} registros con Google Drive.`,
  };
}
