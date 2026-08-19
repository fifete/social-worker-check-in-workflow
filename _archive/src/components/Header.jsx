export default function Header({ isOffline = false }) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-brand-light">
      <h1 className="font-bold text-xl text-brand-slate">Control de Asistencia</h1>

      <div className="flex items-center gap-2 rounded-full bg-white/80 px-3 py-2 shadow-sm">
        <span
          className={`h-3 w-3 rounded-full ${isOffline ? 'bg-brand-amber' : 'bg-brand-emerald'}`}
          aria-hidden="true"
        />
        <span className="text-sm font-semibold text-brand-slate">
          {isOffline ? 'Modo Local (Fuera de línea)' : 'Conectado'}
        </span>
      </div>
    </header>
  );
}
