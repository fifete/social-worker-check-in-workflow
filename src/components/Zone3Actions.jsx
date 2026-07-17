import { useMemo } from 'react';

export default function Zone3Actions({
  activeState,
  searchStatus,
  searchResults = [],
  searchMessage = '',
  selectedVisitor,
  onSelectVisitor,
  onRegisterAttendance,
  onUndoAttendance,
  onAuthenticate,
  isAuthenticating = false,
  authMessage = '',
  onSelectFile,
  isPickerLoading = false,
  onSyncWithDrive,
  isOffline = false,
  isSyncing = false,
  syncMessage = '',
}) {
  const resolvedState = useMemo(() => {
    if (searchStatus === 'THRESHOLD_WARNING' || searchStatus === 'OVERFLOW_WARNING') {
      return 'READY_EMPTY';
    }

    if (selectedVisitor) {
      return 'CONFIRMED_MATCH';
    }

    if (searchStatus === 'SUCCESS' && searchResults.length > 0) {
      return 'MULTI_MATCH';
    }

    return activeState;
  }, [activeState, searchResults.length, searchStatus, selectedVisitor]);

  const stateContent = useMemo(() => {
    if (searchStatus === 'THRESHOLD_WARNING') {
      return (
        <div className="flex flex-1 items-center justify-center px-6 py-4 text-center">
          <p className="text-base font-semibold text-amber-600">{searchMessage}</p>
        </div>
      );
    }

    if (searchStatus === 'OVERFLOW_WARNING') {
      return (
        <div className="flex flex-1 items-center justify-center px-6 py-4 text-center">
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-700">
            {searchMessage}
          </p>
        </div>
      );
    }

    switch (resolvedState) {
      case 'AUTH_PENDING':
        return (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
            <button
              type="button"
              onClick={() => onAuthenticate?.()}
              disabled={isAuthenticating}
              className="min-h-[56px] min-w-[56px] cursor-pointer rounded-2xl bg-brand-blue px-6 py-4 text-base font-bold uppercase tracking-wide text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isAuthenticating ? 'Conectando con Google...' : 'CONECTAR CON GOOGLE'}
            </button>
            {authMessage ? (
              <p className="text-sm font-semibold text-brand-slate">{authMessage}</p>
            ) : null}
          </div>
        );

      case 'FILE_PICKER_PENDING':
        return (
          <div className="flex flex-1 items-center justify-center p-4">
            <button
              type="button"
              onClick={() => !isPickerLoading && onSelectFile?.()}
              disabled={isPickerLoading}
              className="min-h-[56px] min-w-[56px] cursor-pointer rounded-2xl bg-brand-slate px-6 py-4 text-base font-bold uppercase tracking-wide text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isPickerLoading ? 'Clonando archivo y procesando registros...' : 'SELECCIONAR EXCEL DE DRIVE'}
            </button>
          </div>
        );

      case 'READY_EMPTY':
        return (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-4 text-center">
            <p className="mb-6 text-base font-semibold leading-6 text-brand-slate">
              Escanee un código de barras DNI o escriba en el buscador para comenzar.
            </p>
            <button
              type="button"
              onClick={() => !isOffline && !isSyncing && onSyncWithDrive?.()}
              disabled={isOffline || isSyncing}
              className={`min-h-[56px] min-w-[56px] w-full rounded-2xl px-4 py-3 text-sm font-semibold ${
                isOffline
                  ? 'cursor-not-allowed bg-gray-300 text-gray-500 opacity-50'
                  : isSyncing
                    ? 'cursor-not-allowed bg-gray-200 text-brand-slate opacity-70'
                    : 'cursor-pointer bg-gray-200 text-brand-slate'
              }`}
            >
              {isSyncing ? 'Sincronizando con Drive...' : 'Sincronizar Datos con Drive'}
            </button>
            {isOffline && (
              <p className="mt-3 text-sm font-bold text-amber-600">
                ⚠️ No se puede sincronizar en Modo Local. Conéctese a internet para enviar los registros.
              </p>
            )}
            {!isOffline && syncMessage && !isSyncing && (
              <p className="mt-3 text-sm font-semibold text-brand-slate">{syncMessage}</p>
            )}
          </div>
        );

      case 'MULTI_MATCH':
        return (
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {searchResults.map((match) => (
              <button
                key={match.recordId}
                type="button"
                onClick={() => onSelectVisitor?.(match)}
                className="min-h-[56px] min-w-[56px] w-full cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm"
              >
                <div className="text-base font-bold text-brand-slate">{match.visitorName}</div>
                <div className="text-sm font-medium text-brand-slate">DNI: {match.visitorId}</div>
                <div className="text-sm font-semibold text-brand-emerald mt-1">Visita a: {match.hostName}</div>
              </button>
            ))}
          </div>
        );

      case 'CONFIRMED_MATCH':
        return (
          <div className="flex flex-1 flex-col gap-4 p-4">
            <div className="rounded-3xl bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-slate/70">
                DATOS DEL VISITANTE
              </p>
              <h2 className="mt-3 text-2xl font-black text-brand-slate">
                {selectedVisitor?.visitorName ?? 'VISITANTE SELECCIONADO'}
              </h2>
              <p className="mt-2 text-base font-semibold text-brand-slate">
                DNI: {selectedVisitor?.visitorId ?? '—'}
              </p>

              <div className="mt-4 flex flex-wrap gap-2 text-sm font-medium text-brand-slate">
                <span className="rounded-full bg-brand-light px-3 py-2">
                  {selectedVisitor?.visitorAge ? `${selectedVisitor.visitorAge} años` : 'Edad no disponible'}
                </span>
                <span className="rounded-full bg-brand-light px-3 py-2">
                  {selectedVisitor?.relationship ?? 'RELACIÓN NO DISPONIBLE'}
                </span>
              </div>

              <div className="mt-4 rounded-2xl bg-brand-light p-3 text-base font-semibold text-brand-slate">
                Va a visitar a: {selectedVisitor?.hostName ?? '—'}
              </div>
            </div>

            <div className="mt-auto flex flex-col gap-3">
              {!selectedVisitor?.attendanceStatus ? (
                <button
                  type="button"
                  onClick={() => onRegisterAttendance?.(selectedVisitor?.recordId)}
                  className="min-h-[56px] min-w-[56px] cursor-pointer rounded-2xl bg-brand-emerald px-4 py-3 text-base font-extrabold uppercase tracking-wide text-white"
                >
                  REGISTRAR ASISTENCIA
                </button>
              ) : (
                <>
                  <div className="rounded-2xl bg-slate-200 px-4 py-3 text-center text-sm font-semibold text-brand-slate">
                    ✓ ASISTENCIA REGISTRADA
                  </div>
                  <button
                    type="button"
                    onClick={() => onUndoAttendance?.(selectedVisitor?.recordId)}
                    className="min-h-[56px] min-w-[56px] cursor-pointer rounded-2xl bg-transparent px-3 py-2 text-sm font-semibold text-brand-slate underline"
                  >
                    Anular Registro
                  </button>
                </>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  }, [authMessage, isAuthenticating, isOffline, isPickerLoading, isSyncing, onAuthenticate, onRegisterAttendance, onSelectFile, onSelectVisitor, onSyncWithDrive, onUndoAttendance, resolvedState, searchMessage, searchStatus, searchResults, selectedVisitor, syncMessage]);

  return <div className="flex h-full flex-col bg-brand-light">{stateContent}</div>;
}
