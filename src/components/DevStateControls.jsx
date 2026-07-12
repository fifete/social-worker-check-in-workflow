const states = ['AUTH_PENDING', 'FILE_PICKER_PENDING', 'READY_EMPTY', 'MULTI_MATCH', 'CONFIRMED_MATCH'];

export default function DevStateControls({
  currentState,
  onStateChange,
  isOffline,
  onOfflineToggle,
  onSeedMockData,
  onClearDatabase,
  onSimulateBarcodeScan,
  defaultScanValue = '12345678',
}) {
  const handleSimulateBarcodeScan = () => {
    const simulatedValue = window.prompt('Ingrese un identificador para simular escaneo', defaultScanValue);

    if (simulatedValue === null) {
      return;
    }

    onSimulateBarcodeScan?.(simulatedValue);
  };
  return (
    <div className="absolute bottom-3 left-3 right-3 rounded-2xl border border-slate-200/80 bg-white/80 px-3 py-3 shadow-lg backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2">
        {states.map((state) => (
          <button
            key={state}
            type="button"
            onClick={() => onStateChange(state)}
            className={`min-h-[56px] min-w-[56px] rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
              currentState === state
                ? 'bg-brand-slate text-white'
                : 'bg-brand-light text-brand-slate'
            }`}
          >
            {state}
          </button>
        ))}

        <button
          type="button"
          onClick={handleSimulateBarcodeScan}
          className="min-h-[56px] rounded-xl bg-brand-emerald px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white"
        >
          📷 Simular Escaneo DNI
        </button>

        <button
          type="button"
          onClick={onSeedMockData}
          className="min-h-[56px] rounded-xl bg-brand-emerald px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white"
        >
          🌱 Cargar Datos Mock (IndexedDB)
        </button>

        <button
          type="button"
          onClick={onClearDatabase}
          className="min-h-[56px] rounded-xl bg-brand-amber px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white"
        >
          🗑️ Limpiar DB
        </button>

        <button
          type="button"
          onClick={onOfflineToggle}
          className={`min-h-[56px] min-w-[56px] rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
            isOffline ? 'bg-brand-amber text-white' : 'bg-brand-emerald text-white'
          }`}
        >
          {isOffline ? 'Offline' : 'Online'}
        </button>
      </div>
    </div>
  );
}
