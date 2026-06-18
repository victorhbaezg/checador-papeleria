import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import {
  cargarTareas,
  alternarTarea,
  type TareaConEstado,
  type ResumenTareas,
} from "../lib/tareas";
import { useRecargarAlVolver } from "../lib/useRecargar";

export default function Tareas() {
  const { trabajador } = useAuth();
  const [resumen, setResumen] = useState<ResumenTareas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);

  useEffect(() => {
    if (!trabajador) return;
    void cargar(trabajador.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trabajador?.id]);
  useRecargarAlVolver(() => {
    if (trabajador) void cargar(trabajador.id);
  });


  const cargar = async (trabajadorId: string) => {
    setCargando(true);
    try {
      await cargarDatos(trabajadorId);
    } catch (e) {
      console.error("[Tareas] error al cargar:", e);
    } finally {
      setCargando(false);
    }
  };

  const cargarDatos = async (trabajadorId: string) => {
    const r = await cargarTareas(trabajadorId);
    setResumen(r);
    setCargando(false);
  };

  const alternar = async (tarea: TareaConEstado) => {
    if (!trabajador || guardandoId) return;
    setGuardandoId(tarea.id);
    // Optimista: cambiamos el estado local de inmediato
    setResumen((prev) => recalcular(prev, tarea.id));
    try {
      await alternarTarea(tarea, trabajador.id);
    } catch {
      // Si falla, recargamos para volver al estado real
      await cargar(trabajador.id);
    } finally {
      setGuardandoId(null);
    }
  };

  if (!trabajador) return null;

  const diarias = resumen?.items.filter((t) => t.frecuencia === "diaria") ?? [];
  const semanales = resumen?.items.filter((t) => t.frecuencia === "semanal") ?? [];

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-navy-700">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-4">
          <Link
            to="/"
            className="flex items-center gap-1 text-sm font-medium text-navy-100 transition hover:text-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            Atras
          </Link>
          <p className="text-sm font-semibold text-white">Mis tareas</p>
          <span className="w-14" />
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 py-6">
        {/* Progreso */}
        {resumen && resumen.total > 0 && (
          <div className="card">
            <div className="flex items-center justify-between">
              <p className="label-section">Progreso de hoy</p>
              <span
                className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                  resumen.pendientes === 0
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {resumen.hechas}/{resumen.total}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-marca-500 transition-all"
                style={{
                  width: `${resumen.total ? (resumen.hechas / resumen.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {cargando && <p className="text-sm text-slate-400">Cargando tareas...</p>}

        {!cargando && resumen && resumen.total === 0 && (
          <div className="card text-center text-sm text-slate-500">
            No tienes tareas asignadas. Si crees que deberias tener, avisale a Hugo.
          </div>
        )}

        {diarias.length > 0 && (
          <div className="space-y-2">
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Cada dia
            </p>
            {diarias.map((t) => (
              <FilaTarea
                key={t.id}
                tarea={t}
                guardando={guardandoId === t.id}
                onAlternar={() => void alternar(t)}
              />
            ))}
          </div>
        )}

        {semanales.length > 0 && (
          <div className="space-y-2">
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Cada semana
            </p>
            {semanales.map((t) => (
              <FilaTarea
                key={t.id}
                tarea={t}
                guardando={guardandoId === t.id}
                onAlternar={() => void alternar(t)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function FilaTarea({
  tarea,
  guardando,
  onAlternar,
}: {
  tarea: TareaConEstado;
  guardando: boolean;
  onAlternar: () => void;
}) {
  return (
    <button
      onClick={onAlternar}
      disabled={guardando}
      className={`flex w-full items-center gap-3 rounded-lg p-4 text-left ring-1 transition disabled:opacity-60 ${
        tarea.hecha
          ? "bg-emerald-50 ring-emerald-200"
          : "bg-white ring-slate-200 hover:ring-navy-300"
      }`}
    >
      <span
        className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border-2 transition ${
          tarea.hecha
            ? "border-emerald-600 bg-emerald-600 text-white"
            : "border-slate-300 bg-white"
        }`}
      >
        {tarea.hecha && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </span>
      <span
        className={`flex-1 text-sm font-medium ${
          tarea.hecha ? "text-slate-400 line-through" : "text-slate-800"
        }`}
      >
        {tarea.titulo}
      </span>
    </button>
  );
}

/** Recalcula el resumen invirtiendo el estado de una tarea (update optimista). */
function recalcular(prev: ResumenTareas | null, tareaId: string): ResumenTareas | null {
  if (!prev) return prev;
  const items = prev.items.map((t) =>
    t.id === tareaId ? { ...t, hecha: !t.hecha } : t,
  );
  const hechas = items.filter((i) => i.hecha).length;
  return { items, total: items.length, hechas, pendientes: items.length - hechas };
}
