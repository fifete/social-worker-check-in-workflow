import { useEffect, useRef, useState } from 'react';
import { useMachine } from '@xstate/react';
import { checkInMachine } from './machine.js';
import { openDatabase } from './db/db.js';
import * as visitorService from './services/visitorService.js';
import * as authService    from './services/authService.js';
import * as driveService   from './services/driveService.js';
import Zone1Scanner  from './components/Zone1Scanner.jsx';
import Zone2Search   from './components/Zone2Search.jsx';
import Zone3Actions  from './components/Zone3Actions.jsx';
import SyncOverlay   from './components/SyncOverlay.jsx';
import Toast         from './components/Toast.jsx';

const SYNC_PUSH_MESSAGES = {
  BATCH_UNAUTHORIZED:  'Sesión expirada. Intente sincronizar de nuevo.',
  BATCH_FORBIDDEN:     'Sin permiso para escribir en el archivo. Verifique el acceso.',
  BATCH_RATE_LIMITED:  'Demasiadas solicitudes. Espere un momento e intente de nuevo.',
  BATCH_SERVER_ERROR:  'Error del servidor. Intente de nuevo más tarde.',
  BATCH_NETWORK_ERROR: 'Sin conexión. Verifique su red e intente de nuevo.',
  NO_TOKEN:            'No hay sesión activa. Inicie sesión e intente de nuevo.',
};

export default function App() {
  const [state, send] = useMachine(checkInMachine);
  const [bootError, setBootError]       = useState(null);
  const [bootDone, setBootDone]         = useState(false);
  const [prefillSearch, setPrefillSearch] = useState('');
  const [toast, setToast]               = useState({ visible: false, message: '' });

  // Track which SYNCING sub-states we've already handled to prevent double-firing
  const handledSyncState = useRef(null);

  // ─── Derived state values ─────────────────────────────────────────────────
  const isAttendance   = state.matches('ATTENDANCE_PHASE');
  const isSyncing      = state.matches('SYNCING');
  const isResetWarning = state.matches('RESET_WARNING');
  const isResetting    = state.matches('RESETTING');
  const isSyncSuccess  = state.matches('SYNC_SUCCESS');
  const attendanceValue = isAttendance ? state.value.ATTENDANCE_PHASE : null;
  const appFlowState    = attendanceValue?.appFlow  ?? null;
  const scannerState    = attendanceValue?.scanner  ?? null;
  const { context }     = state;

  // ─── Boot sequence (runs once) ────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        await openDatabase();
      } catch (err) {
        setBootError('Error al abrir la base de datos. Cierre otras pestañas e intente de nuevo.');
        return;
      }

      let session = null;
      try {
        session = await visitorService.readSession();
      } catch {
        console.warn('Could not read session; treating as fresh start.');
      }

      const tokenValid = session?.tokenIssuedAt
        ? (Date.now() - session.tokenIssuedAt) < authService.TOKEN_SAFE_WINDOW_MS
        : false;

      const visitorCount = await visitorService.countVisitors();

      if (tokenValid) {
        send({ type: 'AUTH_SUCCESS', visitorCount });
      }
      // If not tokenValid: machine stays in AUTH_PENDING (its initial state)

      setBootDone(true);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Toast trigger ────────────────────────────────────────────────────────
  useEffect(() => {
    if (state.context.toastPending) {
      setToast({ visible: true, message: 'Asistencia registrada.' });
    }
  }, [state.context.toastPending]);

  // ─── Setup phase orchestration ────────────────────────────────────────────
  const setupStateKey = JSON.stringify(state.value);
  useEffect(() => {
    if (state.matches({ FILE_PICKER_PENDING: 'AWAITING_SELECTION' }) && state.context.retriggerPicker) {
      openGooglePicker();
    }

    if (state.matches({ FILE_PICKER_PENDING: 'CHECKING_COLLISION' })) {
      (async () => {
        try {
          const found = await driveService.searchForAsistenciaFile(state.context.masterFileName);
          if (found) {
            send({ type: 'COLLISION_FOUND', orphanFileId: found.id });
          } else {
            send({ type: 'COLLISION_NOT_FOUND' });
          }
        } catch {
          send({ type: 'COLLISION_CHECK_FAILED' });
        }
      })();
    }

    if (state.matches({ FILE_PICKER_PENDING: 'DELETING_ORPHAN' })) {
      (async () => {
        try {
          await driveService.deleteFile(state.context.orphanFileId);
          send({ type: 'ORPHAN_DELETED' });
        } catch {
          send({ type: 'DELETE_FAILED' });
        }
      })();
    }

    if (state.matches({ FILE_PICKER_PENDING: 'COPYING_FILE' })) {
      (async () => {
        try {
          const { workingFileId } = await driveService.copyMasterFile(
            state.context.masterFileId,
            state.context.masterFileName
          );
          send({ type: 'COPY_SUCCESS', workingFileId });
        } catch {
          send({ type: 'COPY_FAILED' });
        }
      })();
    }

    if (state.matches({ FILE_PICKER_PENDING: 'FETCHING_DATA' })) {
      (async () => {
        const session = await visitorService.readSession().catch(() => null);
        const workingFileId = session?.workingFileId
          ?? (state.context.orphanFileId); // fallback for USE_EXISTING_FILE path
        try {
          const rawRows = await driveService.fetchSheetData(workingFileId);
          await visitorService.hydrateFromRows(rawRows);
          send({ type: 'HYDRATION_COMPLETE' });
        } catch {
          send({ type: 'FETCH_FAILED' });
        }
      })();
    }
  }, [setupStateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Reset phase orchestration ────────────────────────────────────────────
  useEffect(() => {
    if (!isResetting) return;
    visitorService.resetSession()
      .then(() => send({ type: 'RESET_COMPLETE' }))
      .catch(() => send({ type: 'RESET_COMPLETE' })); // always complete; data is local
  }, [isResetting]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Sync phase orchestration ─────────────────────────────────────────────
  useEffect(() => {
    if (!state.matches('SYNCING')) {
      handledSyncState.current = null;
      return;
    }

    const syncValue = JSON.stringify(state.value.SYNCING ?? state.value);
    if (handledSyncState.current === syncValue) return;
    handledSyncState.current = syncValue;

    if (state.matches({ SYNCING: 'CHECKING_TOKEN' })) {
      authService.isTokenValid().then(valid => {
        send({ type: valid ? 'TOKEN_VALID' : 'TOKEN_EXPIRED' });
      }).catch(() => {
        send({ type: 'TOKEN_EXPIRED' });
      });
    }

    if (state.matches({ SYNCING: 'REAUTHING' })) {
      authService.reAuthenticate().then(async () => {
        const session = await visitorService.readSession().catch(() => null);
        send({
          type: 'AUTH_SUCCESS',
          accessToken:   session?.accessToken,
          tokenIssuedAt: session?.tokenIssuedAt,
          refreshToken:  session?.refreshToken,
        });
      }).catch(err => {
        const code = err?.code;
        const message =
          code === 'AUTH_CANCELLED'
            ? 'La sesión no pudo renovarse. Reconecte e intente sincronizar de nuevo.'
            : 'Error al renovar la sesión. Intente de nuevo.';
        send({ type: 'AUTH_FAILED', message });
      });
    }

    if (state.matches({ SYNCING: 'PUSHING_DATA' })) {
      (async () => {
        const pending = await visitorService.getPendingSyncRecords().catch(() => []);
        if (pending.length === 0) {
          // No pending records — still purge to reset (graceful path)
          send({ type: 'PUSH_SUCCESS', syncedCount: 0 });
          return;
        }
        const session = await visitorService.readSession().catch(() => null);
        if (!session?.workingFileId || !session?.asistenciaColumn) {
          send({ type: 'PUSH_FAILED', message: 'No se encontró el archivo de trabajo.' });
          return;
        }
        const updates = pending.map(r => ({
          rowIndex:     r.rowIndex,
          columnLetter: session.asistenciaColumn,
        }));
        try {
          await driveService.batchUpdateAttendance(session.workingFileId, updates);
          send({ type: 'PUSH_SUCCESS', syncedCount: pending.length });
        } catch (err) {
          const msg = SYNC_PUSH_MESSAGES[err?.code] ?? 'Error al sincronizar. Intente de nuevo más tarde.';
          send({ type: 'PUSH_FAILED', message: msg });
        }
      })();
    }

    if (state.matches({ SYNCING: 'PURGING_STORES' })) {
      (async () => {
        try {
          await Promise.all([
            visitorService.clearVisitorStore(),
            visitorService.clearSessionStore(),
          ]);
          send({ type: 'PURGE_COMPLETE' });
        } catch (err) {
          console.error('Purge failed after successful Drive push:', err);
          // Drive data is correct; surface a warning but still complete the reset
          // ⚠️ machine has no PURGE_FAILED path; we force PURGE_COMPLETE and show warning
          send({ type: 'PURGE_COMPLETE' });
          setToast({
            visible: true,
            message: 'Los datos se sincronizaron con Drive, pero no se pudo limpiar el almacenamiento local. Recargue la aplicación.',
          });
        }
      })();
    }
  }, [setupStateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Picker loader helper ─────────────────────────────────────────────────
  function openGooglePicker() {
    const gapiLoad = () => {
      window.gapi.load('picker', () => {
        const accessToken = null; // visitorService.readSession() is async; use stored token
        visitorService.readSession().then(session => {
          if (!session?.accessToken) return;
          const view = new window.google.picker.DocsView()
            .setMimeTypes([
              'application/vnd.google-apps.spreadsheet',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ].join(','));

          new window.google.picker.PickerBuilder()
            .addView(view)
            .setOAuthToken(session.accessToken)
            .setDeveloperKey(import.meta.env.VITE_GOOGLE_API_KEY)
            .setAppId(import.meta.env.VITE_GOOGLE_APP_ID)
            .setCallback((data) => {
              if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.PICKED) {
                const doc = data[window.google.picker.Response.DOCUMENTS][0];
                send({
                  type: 'FILE_PICKED',
                  masterFileId:   doc[window.google.picker.Document.ID],
                  masterFileName: doc[window.google.picker.Document.NAME],
                });
              }
            })
            .build()
            .setVisible(true);
        });
      });
    };

    if (window.gapi) {
      gapiLoad();
    } else {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = gapiLoad;
      script.onerror = () => {
        send({ type: 'COPY_FAILED' }); // reuse error path to show inline error
      };
      document.head.appendChild(script);
    }
  }

  async function handleChangeFile() {
    const pendingCount = await visitorService.countPendingAttendance().catch(() => 0);
    send({ type: 'RESET_INITIATED', pendingCount });
  }

  // ─── Loading guard ────────────────────────────────────────────────────────
  if (!bootDone) {
    if (bootError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-6 text-center">
          <p className="text-base font-semibold" style={{ color: 'var(--color-danger)' }}>
            {bootError}
          </p>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 rounded-full border-4 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  // ─── AUTH_PENDING ─────────────────────────────────────────────────────────
  if (state.matches('AUTH_PENDING')) {
    return <AuthScreen send={send} />;
  }

  // ─── FILE_PICKER_PENDING ──────────────────────────────────────────────────
  if (state.matches('FILE_PICKER_PENDING')) {
    return (
      <SetupScreen
        state={state}
        send={send}
        context={context}
        onOpenPicker={openGooglePicker}
      />
    );
  }

  // ─── ATTENDANCE_PHASE ─────────────────────────────────────────────────────
  if (isAttendance) {
    return (
      <div className="flex flex-col h-screen overflow-hidden"
        style={{ background: 'var(--color-bg-page)', pointerEvents: isSyncing ? 'none' : undefined }}>

        <div style={{ height: '30vh', minHeight: 0, flexShrink: 0, position: 'relative' }}>
          <Zone1Scanner
            scannerState={scannerState}
            scanCandidate={context.scanCandidate}
            send={send}
            onBarcodeNotFound={setPrefillSearch}
          />
        </div>

        <div style={appFlowState === 'MULTI_MATCH'
          ? { flex: '1', minHeight: 0, overflow: 'hidden' }
          : { flexShrink: 0 }}>
          <Zone2Search
            appFlowState={appFlowState}
            send={send}
            prefillSearch={prefillSearch}
            onPrefillConsumed={() => setPrefillSearch('')}
          />
        </div>

        {appFlowState !== 'MULTI_MATCH' && (
          <div className="flex-1 overflow-y-auto">
            <Zone3Actions
              appFlowState={appFlowState}
              send={send}
              selectedVisitor={context.selectedVisitor}
              syncError={context.syncError}
              reauthError={context.reauthError}
              onChangeFile={handleChangeFile}
            />
          </div>
        )}

        <Toast
          visible={toast.visible}
          message={toast.message}
          onDismiss={() => setToast({ visible: false, message: '' })}
        />
      </div>
    );
  }

  // ─── SYNCING ───────────────────────────────────────────────────────────────
  if (isSyncing) {
    return <SyncOverlay state={state} send={send} />;
  }

  // ─── RESET_WARNING ─────────────────────────────────────────────────────────
  if (isResetWarning) {
    return <ResetWarningModal pendingCount={context.pendingAttendanceCount} send={send} />;
  }

  // ─── RESETTING ─────────────────────────────────────────────────────────────
  if (isResetting) {
    return <ResettingScreen />;
  }
  // ─── SYNC_SUCCESS ──────────────────────────────────────────────────
  if (isSyncSuccess) {
    return <SyncSuccessScreen count={context.syncedCount} send={send} />;
  }}

// ─── Sync success screen ──────────────────────────────────────────────────────
function SyncSuccessScreen({ count, send }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'var(--color-bg-page)',
        zIndex: 60,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px', gap: 24,
      }}>
      <span style={{ fontSize: 64 }} aria-hidden="true">✅</span>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          ¡Sincronización completa!
        </h1>
        <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
          {count > 0
            ? `${count}\u00a0registro${count !== 1 ? 's' : ''} actualizado${count !== 1 ? 's' : ''} en Google Drive.`
            : 'No había registros pendientes de sincronización.'}
        </p>
      </div>
      <button
        onClick={() => send({ type: 'SYNC_ACKNOWLEDGED' })}
        className="w-full h-14 rounded-lg text-base font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2"
        style={{ maxWidth: 400, background: 'var(--color-primary)', color: 'var(--color-text-inverse)' }}>
        Continuar
      </button>
    </div>
  );
}

// ─── Reset warning modal (bottom-sheet) ─────────────────────────────────────
function ResetWarningModal({ pendingCount, send }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar cambio de archivo"
      style={{
        position: 'fixed', inset: 0,
        background: 'var(--color-bg-overlay)',
        zIndex: 60,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'flex-end',
      }}>
      <div className="p-6 flex flex-col gap-4 rounded-t-2xl"
        style={{ background: 'var(--color-bg-page)' }}>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 22 }} aria-hidden="true">⚠️</span>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            ¿Cambiar archivo?
          </h2>
        </div>
        <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
          Tiene{' '}
          <span className="font-bold" style={{ color: 'var(--color-danger-text)' }}>
            {pendingCount} registro{pendingCount !== 1 ? 's' : ''} de asistencia
          </span>{' '}
          que no han sido sincronizados con Google Drive. Si cambia el archivo ahora, estos registros se perderán de forma permanente.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => send({ type: 'RESET_CONFIRMED' })}
            className="w-full h-14 rounded-lg text-base font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{ background: 'var(--color-danger)', color: 'var(--color-text-inverse)' }}>
            Sí, cambiar archivo
          </button>
          <button
            onClick={() => send({ type: 'RESET_CANCELLED' })}
            className="w-full h-14 rounded-lg text-base font-semibold border-2 focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)', background: 'transparent' }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Resetting screen ────────────────────────────────────────────────────────
function ResettingScreen() {
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'var(--color-bg-overlay)',
        zIndex: 60,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 16,
      }}>
      <div
        style={{
          width: 48, height: 48,
          borderRadius: '50%',
          border: '4px solid rgba(255,255,255,0.3)',
          borderTopColor: '#fff',
          animation: 'spin 0.8s linear infinite',
        }}
        aria-hidden="true"
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p className="text-xl font-bold" style={{ color: 'var(--color-text-inverse)' }}>
        Cambiando archivo...
      </p>
    </div>
  );
}
function AuthScreen({ send }) {
  const [authError, setAuthError] = useState(null);
  const [signing, setSigning]     = useState(false);

  async function handleSignIn() {
    setSigning(true);
    setAuthError(null);
    try {
      const { requestSignIn } = await import('./services/authService.js');
      await requestSignIn();
      const { countVisitors } = await import('./services/visitorService.js');
      const visitorCount = await countVisitors();
      send({ type: 'AUTH_SUCCESS', visitorCount });
    } catch (err) {
      setSigning(false);
      const code = err?.code;
      if (code === 'POPUP_BLOCKED') {
        setAuthError('El navegador bloqueó la ventana emergente. Permita ventanas emergentes e intente de nuevo.');
      } else if (code === 'SESSION_WRITE_FAILED') {
        setAuthError('Error al guardar la sesión. Intente de nuevo.');
      } else if (code !== 'AUTH_CANCELLED') {
        setAuthError('Error al iniciar sesión. Intente de nuevo.');
      }
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 gap-4">
      <h1 className="text-3xl font-bold text-center" style={{ color: 'var(--color-text-primary)' }}>
        Control de Visitas
      </h1>
      <p className="text-base text-center" style={{ color: 'var(--color-text-secondary)' }}>
        Sistema de registro de asistencia
      </p>

      <div className="mt-8 w-full max-w-sm flex flex-col gap-4">
        {authError && (
          <div className="rounded-lg p-3 text-sm"
            style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' }}>
            {authError}
          </div>
        )}

        {authError ? (
          <button
            onClick={handleSignIn}
            disabled={signing}
            className="w-full h-14 rounded-lg text-base font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{ background: 'var(--color-primary)', color: 'var(--color-text-inverse)', focusRingColor: 'var(--color-border-focus)' }}>
            Reintentar
          </button>
        ) : (
          <button
            onClick={handleSignIn}
            disabled={signing}
            className="w-full h-14 rounded-lg text-base font-semibold flex items-center justify-center gap-3 focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{ background: 'var(--color-primary)', color: 'var(--color-text-inverse)' }}>
            <GoogleIcon />
            {signing ? 'Iniciando sesión...' : 'Iniciar sesión con Google'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Setup screen ────────────────────────────────────────────────────────────
function SetupScreen({ state, send, context, onOpenPicker }) {
  const isLoading =
    state.matches({ FILE_PICKER_PENDING: 'CHECKING_COLLISION' }) ||
    state.matches({ FILE_PICKER_PENDING: 'DELETING_ORPHAN' })    ||
    state.matches({ FILE_PICKER_PENDING: 'COPYING_FILE' })       ||
    state.matches({ FILE_PICKER_PENDING: 'FETCHING_DATA' });

  const isCollision  = state.matches({ FILE_PICKER_PENDING: 'COLLISION_PROMPT' });
  const isConfirming = state.matches({ FILE_PICKER_PENDING: 'CONFIRMING_SELECTION' });

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 gap-4">
      <h1 className="text-3xl font-bold text-center" style={{ color: 'var(--color-text-primary)' }}>
        Control de Visitas
      </h1>

      {isLoading && (
        <>
          <div className="w-10 h-10 rounded-full border-4 border-t-transparent animate-spin mt-6"
            style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
          <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
            Cargando datos del evento...
          </p>
        </>
      )}

      {isCollision && (
        <div className="w-full max-w-sm flex flex-col gap-4 mt-4">
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Se encontró un archivo existente
          </h2>
          <p className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {context.masterFileName}_ASISTENCIA
          </p>
          <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
            Se encontró una copia previa del archivo. ¿Qué desea hacer?
          </p>
          {context.setupError && (
            <div className="rounded-lg p-3 text-sm"
              style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' }}>
              {context.setupError}
            </div>
          )}
          <button
            onClick={() => send({ type: 'USE_EXISTING_FILE' })}
            className="w-full h-14 rounded-lg text-base font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{ background: 'var(--color-primary)', color: 'var(--color-text-inverse)' }}>
            Usar archivo existente
          </button>
          <button
            onClick={() => send({ type: 'CREATE_NEW_COPY' })}
            className="w-full h-14 rounded-lg text-base font-semibold border-2 focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)', background: 'transparent' }}>
            Crear copia nueva
          </button>
        </div>
      )}

      {isConfirming && (
        <div className="w-full max-w-sm flex flex-col gap-4 mt-4">
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
            Paso 1 de 2: Confirmar planilla
          </p>
          <p className="text-lg font-bold text-center" style={{ color: 'var(--color-text-primary)' }}>
            ¿Es este el archivo correcto?
          </p>
          <p className="text-base font-semibold text-center p-3 rounded-lg"
            style={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              wordBreak: 'break-word',
            }}>
            {context.masterFileName}
          </p>
          <button
            onClick={() => send({ type: 'FILE_CONFIRMED' })}
            className="w-full h-14 rounded-lg text-base font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{ background: 'var(--color-primary)', color: 'var(--color-text-inverse)' }}>
            Continuar
          </button>
          <button
            onClick={() => send({ type: 'FILE_REJECTED' })}
            className="w-full h-14 rounded-lg text-base font-semibold border-2 focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)', background: 'transparent' }}>
            Cambiar archivo
          </button>
        </div>
      )}

      {!isLoading && !isCollision && !isConfirming && (
        <div className="w-full max-w-sm flex flex-col gap-4 mt-4">
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
            Paso 1 de 2: Seleccionar planilla
          </p>
          <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
            Seleccione la planilla maestra de asistencia desde Google Drive.
          </p>
          {context.setupError && (
            <div className="rounded-lg p-3 text-sm"
              style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' }}>
              {context.setupError}
            </div>
          )}
          <button
            onClick={onOpenPicker}
            className="w-full h-14 rounded-lg text-base font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{ background: 'var(--color-primary)', color: 'var(--color-text-inverse)' }}>
            Seleccionar Planilla
          </button>
        </div>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
