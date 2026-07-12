import { useMemo, useState } from 'react';

const mockMatches = [
  { visitorName: 'ANA GARCÍA', visitorId: '40123456' },
  { visitorName: 'LUIS TORRES', visitorId: '41234567' },
  { visitorName: 'MARTA RUIZ', visitorId: '42345678' },
];

export default function Zone3Actions({ activeState }) {
  const [isAttended, setIsAttended] = useState(false);

  const stateContent = useMemo(() => {
    switch (activeState) {
      case 'AUTH_PENDING':
        return (
          <div className="flex flex-1 items-center justify-center p-4">
            <button
              type="button"
              className="min-h-[56px] min-w-[56px] rounded-2xl bg-brand-blue px-6 py-4 text-base font-bold uppercase tracking-wide text-white shadow-sm"
            >
              CONECTAR CON GOOGLE
            </button>
          </div>
        );

      case 'FILE_PICKER_PENDING':
        return (
          <div className="flex flex-1 items-center justify-center p-4">
            <button
              type="button"
              className="min-h-[56px] min-w-[56px] rounded-2xl bg-brand-slate px-6 py-4 text-base font-bold uppercase tracking-wide text-white shadow-sm"
            >
              SELECCIONAR EXCEL DE DRIVE
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
              className="min-h-[56px] min-w-[56px] w-full rounded-2xl bg-gray-200 px-4 py-3 text-sm font-semibold text-brand-slate"
            >
              Sincronizar Datos con Drive
            </button>
          </div>
        );

      case 'MULTI_MATCH':
        return (
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {mockMatches.map((match) => (
              <button
                key={match.visitorId}
                type="button"
                className="min-h-[56px] min-w-[56px] w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm"
              >
                <div className="text-base font-bold text-brand-slate">{match.visitorName}</div>
                <div className="text-sm font-medium text-brand-slate">{match.visitorId}</div>
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
              <h2 className="mt-3 text-2xl font-black text-brand-slate">CARLOS MENDOZA</h2>
              <p className="mt-2 text-base font-semibold text-brand-slate">
                DNI: 71234568
              </p>

              <div className="mt-4 flex flex-wrap gap-2 text-sm font-medium text-brand-slate">
                <span className="rounded-full bg-brand-light px-3 py-2">45 años</span>
                <span className="rounded-full bg-brand-light px-3 py-2">PADRE</span>
              </div>

              <div className="mt-4 rounded-2xl bg-brand-light p-3 text-base font-semibold text-brand-slate">
                Va a visitar a: MARIA MENDOZA
              </div>
            </div>

            <div className="mt-auto flex flex-col gap-3">
              {!isAttended ? (
                <button
                  type="button"
                  onClick={() => setIsAttended(true)}
                  className="min-h-[56px] min-w-[56px] rounded-2xl bg-brand-emerald px-4 py-3 text-base font-extrabold uppercase tracking-wide text-white"
                >
                  REGISTRAR ASISTENCIA
                </button>
              ) : (
                <>
                  <div className="rounded-2xl bg-slate-200 px-4 py-3 text-center text-sm font-semibold text-brand-slate">
                    ✓ ASISTENCIA REGISTRADA [Hora: 11:15]
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAttended(false)}
                    className="min-h-[56px] min-w-[56px] rounded-2xl bg-transparent px-3 py-2 text-sm font-semibold text-brand-slate underline"
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
  }, [activeState, isAttended]);

  return <div className="flex h-full flex-col bg-brand-light">{stateContent}</div>;
}
