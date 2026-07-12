export default function Zone1Scanner({ isActive = true }) {
  if (!isActive) {
    return null;
  }

  return (
    <section className="h-[30%] min-h-[180px] w-full bg-black relative flex items-center justify-center">
      <div className="relative aspect-[4/3] w-[72%] min-w-[220px] max-w-[320px] rounded-sm border-2 border-brand-emerald p-4">
        <div className="absolute left-2 top-2 h-6 w-6 border-l-2 border-t-2 border-brand-emerald" />
        <div className="absolute right-2 top-2 h-6 w-6 border-r-2 border-t-2 border-brand-emerald" />
        <div className="absolute bottom-2 left-2 h-6 w-6 border-b-2 border-l-2 border-brand-emerald" />
        <div className="absolute bottom-2 right-2 h-6 w-6 border-b-2 border-r-2 border-brand-emerald" />

        <div className="flex h-full items-center justify-center px-3 text-center text-sm font-medium text-white/70">
          [Camara Activa - Retícula de Escaneo]
        </div>
      </div>
    </section>
  );
}
