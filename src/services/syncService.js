import { getValidToken, handleExpiredTokenReAuth } from './authService.js';
import { getAllVisitors } from './visitorService.js';
import { getDB } from '../db/db.js';

export async function executeBatchSync(tokenClient) {
  // Step 1: Query pending records
  const allVisitors = await getAllVisitors();
  const pendingRecords = allVisitors.filter(
    (record) => record.attendanceStatus === true && record.syncedWithCloud === false,
  );

  if (pendingRecords.length === 0) {
    return { status: 'UP_TO_DATE', count: 0, message: 'Todos los registros están sincronizados.' };
  }

  // Step 2: Token health check (before any network call)
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

  // Step 4: Build payload
  const valuesToAppend = pendingRecords.map((record) => [
    record.visitorId,
    record.visitorName,
    'ASISTIÓ',
    record.attendanceTimestamp,
  ]);

  // Step 5: Cloud execution
  const encodedRange = encodeURIComponent('Sheet1!A:D');
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(workingFileId)}/values/${encodedRange}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: valuesToAppend }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error?.message ?? `Sheets sync failed with status ${response.status}`);
  }

  // Step 6: Mark records as synced locally
  const writeTx = db.transaction(['visitorStore'], 'readwrite');
  const visitorStore = writeTx.objectStore('visitorStore');

  for (const record of pendingRecords) {
    await visitorStore.put({ ...record, syncedWithCloud: true });
  }

  await writeTx.done;

  return {
    status: 'SUCCESS',
    count: pendingRecords.length,
    message: `Se sincronizaron ${pendingRecords.length} registros con Google Drive.`,
  };
}
