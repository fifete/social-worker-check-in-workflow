import * as authService    from './authService.js';
import * as driveService   from './driveService.js';
import * as visitorService from './visitorService.js';

// Error code → Spanish user message mapping (from syncService.md)
const DRIVE_ERROR_MESSAGES = {
  BATCH_UNAUTHORIZED: 'Sesión expirada. Intente sincronizar de nuevo.',
  BATCH_FORBIDDEN:    'Sin permiso para escribir en el archivo. Verifique el acceso.',
  BATCH_RATE_LIMITED: 'Demasiadas solicitudes. Espere un momento e intente de nuevo.',
  BATCH_SERVER_ERROR: 'Error del servidor. Intente de nuevo más tarde.',
  BATCH_NETWORK_ERROR:'Sin conexión. Verifique su red e intente de nuevo.',
  BATCH_API_ERROR:    'Error al sincronizar. Intente de nuevo más tarde.',
  NO_TOKEN:           'No hay sesión activa. Inicie sesión e intente de nuevo.',
};

const REAUTH_MESSAGES = {
  REAUTH_CANCELLED:     'La sesión no pudo renovarse. Reconecte e intente sincronizar de nuevo.',
  REAUTH_FAILED:        'Error al renovar la sesión. Intente de nuevo.',
  SESSION_WRITE_FAILED: 'Error al guardar la sesión renovada. Intente de nuevo.',
};

/**
 * Executes the full Phase 3 sync sequence.
 *
 * @returns {Promise<
 *   { status: 'SUCCESS' } |
 *   { status: 'NO_PENDING_RECORDS' } |
 *   { status: 'ERROR'; code: string; message: string }
 * >}
 */
export async function runSync() {
  // Step 1 — Check token validity
  const tokenValid = await authService.isTokenValid();

  // Step 2 — Re-authenticate if expired
  if (!tokenValid) {
    try {
      await authService.reAuthenticate();
    } catch (err) {
      const code    = err?.code ?? 'REAUTH_FAILED';
      const syncCode =
        code === 'AUTH_CANCELLED'      ? 'REAUTH_CANCELLED'
        : code === 'SESSION_WRITE_FAILED' ? 'SESSION_WRITE_FAILED'
        : 'REAUTH_FAILED';

      return {
        status:  'ERROR',
        code:    syncCode,
        message: REAUTH_MESSAGES[syncCode] ?? REAUTH_MESSAGES.REAUTH_FAILED,
      };
    }
  }

  // Step 3 — Collect pending records
  let pending;
  try {
    pending = await visitorService.getPendingSyncRecords();
  } catch {
    return {
      status:  'ERROR',
      code:    'PENDING_QUERY_FAILED',
      message: 'Error al leer los registros pendientes. Intente de nuevo.',
    };
  }

  if (pending.length === 0) {
    return { status: 'NO_PENDING_RECORDS' };
  }

  // Step 4 — Read working file ID and column letter
  let session;
  try {
    session = await visitorService.readSession();
  } catch {
    session = null;
  }

  if (!session?.workingFileId) {
    return {
      status:  'ERROR',
      code:    'NO_WORKING_FILE',
      message: 'No se encontró el archivo de trabajo. Vuelva a configurar el evento.',
    };
  }

  if (!session?.asistenciaColumn) {
    return {
      status:  'ERROR',
      code:    'NO_ASISTENCIA_COLUMN',
      message: 'No se encontró la columna de asistencia. Vuelva a cargar los datos.',
    };
  }

  const { workingFileId, asistenciaColumn } = session;

  // Step 5 — Build update payload
  const updates = pending.map((record) => ({
    rowIndex:     record.rowIndex,
    columnLetter: asistenciaColumn,
  }));

  // Step 6 — Push to Drive
  try {
    await driveService.batchUpdateAttendance(workingFileId, updates);
  } catch (err) {
    const driveCode = err?.code ?? 'BATCH_API_ERROR';
    const syncCode  =
      driveCode === 'BATCH_UNAUTHORIZED' ? 'SYNC_UNAUTHORIZED'
      : driveCode === 'BATCH_FORBIDDEN'  ? 'SYNC_FORBIDDEN'
      : driveCode === 'BATCH_RATE_LIMITED' ? 'SYNC_RATE_LIMITED'
      : driveCode === 'BATCH_SERVER_ERROR' ? 'SYNC_SERVER_ERROR'
      : driveCode === 'BATCH_NETWORK_ERROR' ? 'SYNC_NETWORK_ERROR'
      : driveCode === 'NO_TOKEN'           ? 'SYNC_NO_TOKEN'
      : 'SYNC_API_ERROR';

    return {
      status:  'ERROR',
      code:    syncCode,
      message: DRIVE_ERROR_MESSAGES[driveCode] ?? DRIVE_ERROR_MESSAGES.BATCH_API_ERROR,
    };
  }

  // Step 7 — Purge stores (only after confirmed HTTP 200)
  try {
    await Promise.all([
      visitorService.clearVisitorStore(),
      visitorService.clearSessionStore(),
    ]);
  } catch (err) {
    console.error('[syncService] Purge failed after successful Drive push:', err);
    return {
      status:  'ERROR',
      code:    'PURGE_FAILED',
      message: 'Sync successful but local data could not be cleared.',
    };
  }

  // Step 8 — Success
  return { status: 'SUCCESS' };
}
