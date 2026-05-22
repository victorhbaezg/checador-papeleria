import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  supabase,
  type Trabajador,
  type Marca,
  type Horario,
  type FaltaJustificada,
  type HorarioExcepcion,
} from "../../lib/supabase";
import { inicioSemanaMx, ZONA_HORARIA } from "../../lib/marcado";
import { calcularResumenSemana, type ResumenSemana } from "../../lib/reporte";
import { pesos } from "../../lib/dias";

type FilaReporte = {
  trabajador: Trabajador;
  resumen: ResumenSemana;
  marcasSemana: Marca[];
  faltasJustificadas: FaltaJustificada[];
};

function fechaCorta(d: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA_HORARIA,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

function horaCorta(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA_HORARIA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function fechaCortaStr(fecha: string): string {
  const d = new Date(fecha + "T12:00:00");
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA_HORARIA,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

function buildDiasExcluidos(
  faltasJust: FaltaJustificada[],
  excepciones: HorarioExcepcion[],
  trabajadorId: string,
): Set<string> {
  const set = new Set<string>();
  for (const f of faltasJust) {
    if (f.trabajador_id === trabajadorId) set.add(f.fecha);
  }
  for (const e of excepciones) {
    if (e.trabajador_id === trabajadorId && e.es_dia_libre) set.add(e.fecha);
  }
  return set;
}

export default function ReporteSemanal() {
  const [filas, setFilas] = useState<FilaReporte[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);

  const inicioUtc = inicioSemanaMx();
  const hoyUtc = new Date();
  const diasHastaViernes = 5 - (hoyUtc.getDay() === 0 ? 7 : hoyUtc.getDay());
  const finUtc =
    diasHastaViernes >= 0
      ? hoyUtc
      : new Date(hoyUtc.getTime() + diasHastaViernes * 24 * 60 * 60 * 1000);

  useEffect(() => {
    void cargar();
  }, []);

  const cargar = async () => {
    setCargando(true);
    setError(null);

    const { data: trabajadores, error: errT } = await supabase
      .from("trabajadores")
      .select("*")
      .eq("activo", true)
      .order("nombre", { ascending: true });

    if (errT || !trabajadores) {
      setError(errT?.message ?? "Error al cargar trabajadores");
      setCargando(false);
      return;
    }

    const ids = (trabajadores as Trabajador[]).map((t) => t.id);
    const inicioStr = inicioUtc.toISOString().substring(0, 10);

    const [
      { data: marcas, error: errM },
      { data: horarios, error: errH },
      { data: faltasJustData },
      { data: excepcionesData },
    ] = await Promise.all([
      supabase
        .from("marcas")
        .select("*")
        .in("trabajador_id", ids)
        .gte("marcado_en", inicioUtc.toISOString())
        .order("marcado_en", { ascending: true }),
      supabase.from("horarios").select("*").in("trabajador_id", ids),
      supabase
        .from("faltas_justificadas")
        .select("*")
        .in("trabajador_id", ids)
        .gte("fecha", inicioStr),
      supabase
        .from("horario_excepciones")
        .select("*")
        .in("trabajador_id", ids)
        .gte("fecha", inicioStr)
        .eq("es_dia_libre", true),
    ]);

    if (errM || errH) {
      setError(errM?.message ?? errH?.message ?? "Error al cargar datos");
      setCargando(false);
      return;
    }

    const marcasData = (marcas ?? []) as Marca[];
    const horariosData = (horarios ?? []) as Horario[];
    const faltasJust = (faltasJustData ?? []) as FaltaJustificada[];
    const excepciones = (excepcionesData ?? []) as HorarioExcepcion[];

    const resultado: FilaReporte[] = (trabajadores as Trabajador[]).map((t) => {
      const misMarcas = marcasData.filter((m) => m.trabajador_id === t.id);
      const misHorarios = horariosData.filter((h) => h.trabajador_id === t.id);
      const misFaltasJust = faltasJust.filter((f) => f.trabajador_id === t.id);
      const diasExcluidos = buildDiasExcluidos(faltasJust, excepciones, t.id);
      const resumen = calcularResumenSemana(misMarcas, misHorarios, t.tarifa_hora, diasExcluidos);
      return { trabajador: t, resumen, marcasSemana: misMarcas, faltasJustificadas: misFaltasJust };
    });

    setFilas(resultado);
    setCargando(false);
  };

  const granTotal = filas.reduce((acc, f) => acc + f.resumen.totalPago, 0);
  const granHoras = filas.reduce((acc, f) => acc + f.resumen.horasTrabajadas, 0);

  const filaDetalle = detalleId ? filas.find((f) => f.trabajador.id === detalleId) : null;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-navy-700">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <Link
            to="/admin"
            className="flex items-center gap-1 text-sm font-medium text-navy-100 transition hover:text-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            Admin
          </Link>
          <p className="text-sm font-semibold text-white">Reporte semanal</p>
          <span className="w-14" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        <div>
          <h1 className="text-lg font-bold text-navy-700">Semana en curso</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {fechaCorta(inicioUtc)} &mdash; {fechaCorta(finUtc)}
          </p>
        </div>

        {cargando && <p className="text-sm text-slate-400">Calculando reporte...</p>}

        {error && (
          <div className="rounded-lg bg-rose-50 p-5 text-sm text-rose-700 ring-1 ring-rose-200">
            {error}
          </div>
        )}

        {!cargando && !error && filas.length === 0 && (
          <div className="card text-center text-sm text-slate-500">
            No hay trabajadores activos.
          </div>
        )}

        {!cargando && !error && filas.length > 0 && (
          <div className="space-y-3">
            {filas.map(({ trabajador, resumen }) => (
              <TarjetaTrabajador
                key={trabajador.id}
                trabajador={trabajador}
                resumen={resumen}
                onDetalle={() => setDetalleId(trabajador.id)}
              />
            ))}
          </div>
        )}

        {!cargando && filas.length > 0 && (
          <div className="card border-t-2 border-marca-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="label-section">Total equipo</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {granHoras.toFixed(1)} h &mdash; {filas.length} trabajador{filas.length !== 1 ? "es" : ""}
                </p>
              </div>
              <p className="text-2xl font-bold text-navy-700">{pesos(granTotal)}</p>
            </div>
          </div>
        )}
      </main>

      {filaDetalle && (
        <ModalDetalleSemanal
          fila={filaDetalle}
          onClose={() => setDetalleId(null)}
          onActualizado={cargar}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta por trabajador
// ---------------------------------------------------------------------------
function TarjetaTrabajador({
  trabajador,
  resumen,
  onDetalle,
}: {
  trabajador: Trabajador;
  resumen: ResumenSemana;
  onDetalle: () => void;
}) {
  const tieneIncidencias = resumen.retardos > 0 || resumen.faltas > 0;

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-navy-700">{trabajador.nombre}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {pesos(trabajador.tarifa_hora)}/h
          </p>
        </div>
        <p className="text-xl font-bold text-marca-600 tabular-nums">
          {pesos(resumen.totalPago)}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
        <div className="text-center">
          <p className="label-section">Horas</p>
          <p className="mt-1 text-lg font-bold text-navy-700 tabular-nums">
            {resumen.horasTrabajadas.toFixed(1)}
          </p>
        </div>
        <div className="border-l border-slate-100 text-center">
          <p className="label-section">Retardos</p>
          <p className={`mt-1 text-lg font-bold tabular-nums ${resumen.retardos > 0 ? "text-amber-600" : "text-navy-700"}`}>
            {resumen.retardos}
          </p>
        </div>
        <div className="border-l border-slate-100 text-center">
          <p className="label-section">Faltas</p>
          <p className={`mt-1 text-lg font-bold tabular-nums ${resumen.faltas > 0 ? "text-rose-600" : "text-navy-700"}`}>
            {resumen.faltas}
          </p>
        </div>
      </div>

      {tieneIncidencias && (
        <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
          <button
            onClick={onDetalle}
            className="rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-medium text-navy-600 ring-1 ring-slate-200 transition hover:ring-navy-300"
          >
            Justificar incidencias
          </button>
        </div>
      )}

      {resumen.horasTrabajadas === 0 && resumen.faltas === 0 && (
        <p className="mt-3 text-center text-xs text-slate-400">
          Sin horas completadas esta semana
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal de justificaciones semanales
// ---------------------------------------------------------------------------
type NuevaFaltaForm = { fecha: string; nota: string };

function ModalDetalleSemanal({
  fila,
  onClose,
  onActualizado,
}: {
  fila: FilaReporte;
  onClose: () => void;
  onActualizado: () => Promise<void>;
}) {
  const retardosActuales = fila.marcasSemana.filter(
    (m) => m.tipo === "entrada" && m.nota === "retardo",
  );
  const [guardando, setGuardando] = useState(false);
  const [nuevaFalta, setNuevaFalta] = useState<NuevaFaltaForm>({ fecha: "", nota: "" });
  const [mostrarFormFalta, setMostrarFormFalta] = useState(false);

  const toggleRetardo = async (marca: Marca) => {
    setGuardando(true);
    await supabase
      .from("marcas")
      .update({ justificada: !marca.justificada })
      .eq("id", marca.id);
    await onActualizado();
    setGuardando(false);
  };

  const eliminarFaltaJust = async (id: string) => {
    setGuardando(true);
    await supabase.from("faltas_justificadas").delete().eq("id", id);
    await onActualizado();
    setGuardando(false);
  };

  const agregarFaltaJust = async () => {
    if (!nuevaFalta.fecha) return;
    setGuardando(true);
    await supabase.from("faltas_justificadas").upsert(
      {
        trabajador_id: fila.trabajador.id,
        fecha: nuevaFalta.fecha,
        nota: nuevaFalta.nota.trim() || null,
      },
      { onConflict: "trabajador_id,fecha" },
    );
    setNuevaFalta({ fecha: "", nota: "" });
    setMostrarFormFalta(false);
    await onActualizado();
    setGuardando(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="font-semibold text-navy-700">{fila.trabajador.nombre}</p>
            <p className="text-xs text-slate-500">Justificar incidencias de la semana</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* Resumen actualizado */}
          <div className="flex gap-4 rounded-lg bg-slate-50 px-4 py-3">
            <div className="text-center">
              <p className="label-section">Retardos</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${fila.resumen.retardos > 0 ? "text-amber-600" : "text-navy-700"}`}>
                {fila.resumen.retardos}
              </p>
            </div>
            <div className="border-l border-slate-200 pl-4 text-center">
              <p className="label-section">Faltas</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${fila.resumen.faltas > 0 ? "text-rose-600" : "text-navy-700"}`}>
                {fila.resumen.faltas}
              </p>
            </div>
            <div className="border-l border-slate-200 pl-4 flex-1 text-right">
              <p className="label-section">Pago semana</p>
              <p className="mt-1 text-xl font-bold text-marca-600 tabular-nums">
                {pesos(fila.resumen.totalPago)}
              </p>
            </div>
          </div>

          {/* Retardos */}
          <div>
            <p className="label-section mb-2">Retardos de la semana</p>
            {retardosActuales.length === 0 ? (
              <p className="text-xs text-slate-400">Sin retardos esta semana.</p>
            ) : (
              <div className="space-y-2">
                {retardosActuales.map((m) => (
                  <div
                    key={m.id}
                    className={`flex items-center justify-between rounded-lg px-3 py-2.5 ring-1 ${
                      m.justificada ? "bg-emerald-50 ring-emerald-200" : "bg-amber-50 ring-amber-200"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        {fechaCortaStr(m.marcado_en.substring(0, 10))}
                      </p>
                      <p className="text-xs text-slate-400">
                        Entrada a las {horaCorta(m.marcado_en)}
                        {m.justificada && " · Justificado"}
                      </p>
                    </div>
                    <button
                      onClick={() => void toggleRetardo(m)}
                      disabled={guardando}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        m.justificada
                          ? "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-rose-300 hover:text-rose-600"
                          : "bg-emerald-600 text-white hover:bg-emerald-700"
                      }`}
                    >
                      {m.justificada ? "Quitar" : "Justificar"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Faltas justificadas */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="label-section">Faltas justificadas</p>
              <button
                onClick={() => setMostrarFormFalta(true)}
                className="text-xs font-medium text-marca-600 transition hover:text-marca-700"
              >
                + Agregar
              </button>
            </div>

            {mostrarFormFalta && (
              <div className="mb-3 space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                <input
                  type="date"
                  value={nuevaFalta.fecha}
                  onChange={(e) => setNuevaFalta((f) => ({ ...f, fecha: e.target.value }))}
                  className="input-field w-full"
                />
                <input
                  type="text"
                  placeholder="Nota (opcional)"
                  value={nuevaFalta.nota}
                  onChange={(e) => setNuevaFalta((f) => ({ ...f, nota: e.target.value }))}
                  className="input-field w-full"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setMostrarFormFalta(false); setNuevaFalta({ fecha: "", nota: "" }); }}
                    className="btn-secondary flex-1 py-1.5 text-xs"
                    disabled={guardando}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => void agregarFaltaJust()}
                    className="btn-primary flex-1 py-1.5 text-xs"
                    disabled={guardando || !nuevaFalta.fecha}
                  >
                    Guardar
                  </button>
                </div>
              </div>
            )}

            {fila.faltasJustificadas.length === 0 && !mostrarFormFalta ? (
              <p className="text-xs text-slate-400">Sin faltas justificadas esta semana.</p>
            ) : (
              <div className="space-y-2">
                {fila.faltasJustificadas.map((fj) => (
                  <div
                    key={fj.id}
                    className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2.5 ring-1 ring-emerald-200"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        {fechaCortaStr(fj.fecha)}
                      </p>
                      {fj.nota && (
                        <p className="text-xs text-slate-400">{fj.nota}</p>
                      )}
                    </div>
                    <button
                      onClick={() => void eliminarFaltaJust(fj.id)}
                      disabled={guardando}
                      className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:ring-rose-300 hover:text-rose-600"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button onClick={onClose} className="btn-secondary w-full">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
