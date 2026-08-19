export default function SyncOverlay({ state }) {
  const isPurging = state.matches({ SYNCING: 'PURGING_STORES' });

  const label = isPurging
    ? 'Limpiando datos locales...'
    : 'Sincronizando datos...';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      style={{
        position: 'fixed', inset: 0,
        background: 'var(--color-bg-overlay)',
        zIndex: 60,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 16,
      }}>
      {/* Spinner */}
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
        {label}
      </p>
    </div>
  );
}
