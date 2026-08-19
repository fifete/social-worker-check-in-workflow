import { useState } from 'react';
import * as visitorService from '../services/visitorService.js';

function formatTime(isoString) {
  if (!isoString) return '—';
  try {
    return new Date(isoString).toLocaleTimeString('es-PE', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch {
    return '—';
  }
}

export default function Zone3Actions({
  appFlowState,
  send,
  selectedVisitor,
  syncError,
  reauthError,
}) {
  const [attendanceError, setAttendanceError] = useState(null);
  const [undoError, setUndoError]             = useState(null);
  const [showUndoSheet, setShowUndoSheet]     = useState(false);

  // ── READY_EMPTY ───────────────────────────────────────────────────────────
  if (appFlowState === 'READY_EMPTY') {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 gap-4"
        style={{ borderTop: '1px solid var(--color-border)' }}>

        {/* Sync error / reauth error banner — persists across state */}
        {(syncError || reauthError) && (
          <div className="w-full rounded-lg p-3 text-sm"
            style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-text)' }}
            role="alert">
            {syncError || reauthError}
          </div>
        )}

        <div className="flex flex-col items-center gap-2 text-center" aria-hidden="true">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4" stroke="var(--color-text-disabled)" strokeWidth="2" />
            <path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" stroke="var(--color-text-disabled)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
            Escanee o busque un visitante para comenzar.
          </p>
        </div>

        <button
          onClick={() => send({ type: 'SYNC_INITIATED' })}
          className="w-full h-14 rounded-lg text-base font-semibold border-2 focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{
            borderColor: 'var(--color-primary)',
            color:       'var(--color-primary)',
            background:  'transparent',
          }}>
          Sincronizar Datos con Drive
        </button>
      </div>
    );
  }

  // ── MULTI_MATCH ───────────────────────────────────────────────────────────
  if (appFlowState === 'MULTI_MATCH') {
    return (
      <div className="flex items-center justify-center h-full px-4"
        style={{ borderTop: '1px solid var(--color-border)' }}>
        <p className="text-sm text-center" style={{ color: 'var(--color-text-secondary)' }}>
          Seleccione un visitante de la lista.
        </p>
      </div>
    );
  }

  // ── CONFIRMED_MATCH ───────────────────────────────────────────────────────
  if (appFlowState === 'CONFIRMED_MATCH' && selectedVisitor) {
    const attended = selectedVisitor.attendanceStatus === true;
    const timeStr  = formatTime(selectedVisitor.attendanceTimestamp);

    async function handleRegister() {
      setAttendanceError(null);
      try {
        await visitorService.recordAttendance(selectedVisitor.visitorId);
        send({ type: 'ATTENDANCE_RECORDED' });
      } catch {
        setAttendanceError('Error al registrar asistencia. Intente de nuevo.');
      }
    }

    async function handleConfirmUndo() {
      setShowUndoSheet(false);
      setUndoError(null);
      try {
        await visitorService.undoAttendance(selectedVisitor.visitorId);
        const updated = await visitorService.getVisitorById(selectedVisitor.visitorId);
        send({ type: 'UNDO_ATTENDANCE', visitor: updated });
      } catch {
        setUndoError('Error al anular el registro. Intente de nuevo.');
      }
    }

    return (
      <div className="flex flex-col px-4 pt-2 pb-6 gap-3 min-h-full"
        style={{ borderTop: '1px solid var(--color-border)' }}>

        {/* Back link */}
        <button
          onClick={() => send({ type: 'BACK' })}
          className="self-start text-sm focus:outline-none"
          style={{ color: 'var(--color-primary)', minHeight: 44 }}>
          ← Volver a la búsqueda
        </button>

        {/* Visitor card */}
        <div className="rounded-xl p-4 flex flex-col gap-2"
          style={{
            background:  'var(--color-bg-card)',
            border:      '1px solid var(--color-border)',
          }}>
          <p className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {selectedVisitor.visitorName}
          </p>
          <p className="text-lg" style={{ color: 'var(--color-text-primary)' }}>
            <span className="font-semibold">DNI:</span> {selectedVisitor.visitorId}
          </p>
          <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="font-semibold">Parentesco:</span> {selectedVisitor.relationship}
          </p>
          <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="font-semibold">Edad:</span> {selectedVisitor.visitorAge}
          </p>
          <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="font-semibold">Visita a:</span> {selectedVisitor.hostName}
          </p>
          <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="font-semibold">Tipo de visita:</span> {selectedVisitor.visitType}
          </p>
        </div>

        {/* Action area */}
        {attended ? (
          <>
            {/* Locked gray badge */}
            <div
              className="w-full rounded-lg p-4 flex items-start gap-3"
              style={{
                background:  'var(--color-attended-bg)',
                border:      '1px solid var(--color-attended-border)',
              }}
              aria-label={`Asistencia registrada a las ${timeStr}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" stroke="var(--color-attended-text)" strokeWidth="2" />
                <path d="M8 12l3 3 5-5" stroke="var(--color-attended-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <p className="text-base font-bold" style={{ color: 'var(--color-attended-text)' }}>
                  Asistencia Ya Registrada
                </p>
                <p className="text-xl font-bold" style={{ color: 'var(--color-attended-text)' }}>
                  {timeStr}
                </p>
              </div>
            </div>

            {/* Undo button */}
            <button
              onClick={() => setShowUndoSheet(true)}
              className="w-full h-14 rounded-lg text-sm font-semibold border-2 focus:outline-none focus:ring-2 focus:ring-offset-2"
              style={{
                borderColor: 'var(--color-danger)',
                color:       'var(--color-danger)',
                background:  'transparent',
              }}>
              Anular Registro
            </button>

            {undoError && (
              <p className="text-sm" style={{ color: 'var(--color-danger-text)' }} aria-live="assertive">
                {undoError}
              </p>
            )}
          </>
        ) : (
          <>
            <button
              onClick={handleRegister}
              className="w-full h-14 rounded-lg text-lg font-bold focus:outline-none focus:ring-2 focus:ring-offset-2"
              style={{ background: 'var(--color-success)', color: 'var(--color-text-inverse)' }}>
              REGISTRAR ASISTENCIA
            </button>

            {attendanceError && (
              <p className="text-sm" style={{ color: 'var(--color-danger-text)' }} aria-live="assertive">
                {attendanceError}
              </p>
            )}
          </>
        )}

        {/* Undo bottom sheet */}
        {showUndoSheet && (
          <UndoBottomSheet
            visitorName={selectedVisitor.visitorName}
            onConfirm={handleConfirmUndo}
            onCancel={() => setShowUndoSheet(false)}
          />
        )}
      </div>
    );
  }

  return null;
}

// ─── Undo confirmation bottom sheet ─────────────────────────────────────────
function UndoBottomSheet({ visitorName, onConfirm, onCancel }) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onCancel}
        style={{
          position: 'fixed', inset: 0,
          background: 'var(--color-bg-overlay)',
          zIndex: 40,
        }}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="undo-heading"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'var(--color-bg-page)',
          borderRadius: '12px 12px 0 0',
          padding: '24px 16px',
          zIndex: 50,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
        <h2 id="undo-heading" className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          ¿Anular el registro?
        </h2>
        <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
          Esta acción eliminará el registro de asistencia de {visitorName}.
        </p>
        <button
          onClick={onConfirm}
          className="w-full h-14 rounded-lg text-base font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{ background: 'var(--color-danger)', color: 'var(--color-text-inverse)' }}>
          Sí, anular
        </button>
        <button
          onClick={onCancel}
          className="w-full h-14 rounded-lg text-base font-semibold border-2 focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)', background: 'transparent' }}>
          Cancelar
        </button>
      </div>
    </>
  );
}
