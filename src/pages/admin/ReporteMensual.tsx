import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  supabase,
  type Trabajador,
  type Marca,
  type Horario,
  type FaltaJustificada,
  type HorarioExcepcion,
  type Tarea,
  type TareaCompletada,
  type TareaJustificada,
} from "../../lib/supabase";
import { ZONA_HORARIA } from "../../lib/marcado";
import {
  inicioMesMx,
  calcularResumenMes,
  detalleTareasIncompletas,
  type ResumenMes,
  type TareaIncompleta,
} from "../../lib/reporte";
import { pesos } from "../../lib/dias";

type FilaReporte = {
  trabajador: Trabajador;
  resumen: ResumenMes;
  marcasMes: Marca[];
  faltasJustificadas: FaltaJustificada[];
  tareas: Tarea[];
  completadas: TareaCompletada[];
  tareasJustificadas: TareaJustificada[];
};

function nombreMes(ahora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA_HORARIA,
    month: "long",
    year: "numeric",
  }).formatToParts(ahora);
  const mes = partes.find((p) => p.type === "month")?.value ?? "";
  const anio = partes.find((p) => p.type === "year")?.value ?? "";
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${anio}`;
}

function fechaCorta(iso: string): string {
  // Acepta tanto "YYYY-MM-DD" como timestamps ISO completos
  const d = iso.length > 10 ? new Date(iso) : new Date(iso + "T12:00:00");
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

function buildDiasExcluidos(
  faltasJust: FaltaJustificada[],
  excepciones: HorarioExcepcion[],
): Set<string> {
  const set = new Set<string>();
  for (const f of faltasJust) set.add(f.fecha);
  for (const e of excepciones) {
    if (e.es_dia_libre) set.add(e.fecha);
  }
  return set;
}

export default function ReporteMensual() {
  const [filas, setFilas] = useState<FilaReporte[]>([]);
  const [montoBono, setMontoBono] = useState(250);
  const [sancionTarea, setSancionTarea] = useState(10);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);

  useEffect(() => {
    void cargar();
  }, []);

  const cargar = async () => {
    setCargando(true);
    setError(null);

    const { data: config } = await supabase
      .from("configuracion")
      .select("monto_bono_mensual, monto_sancion_tarea")
      .single();
    const cfg = config as { monto_bono_mensual: number; monto_sancion_tarea: number } | null;
    const bonoReal = cfg?.monto_bono_mensual ?? 250;
    const sancionReal = cfg?.monto_sancion_tarea ?? 0;
    setMontoBono(bonoReal);
    setSancionTarea(sancionReal);

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
    const inicioUtc = inicioMesMx();

    const [
      { data: marcasData, error: errM },
      { data: horariosData, error: errH },
      { data: faltasJustData },
      { data: excepcionesData },
      { data: tareasData },
      { data: completadasData },
      { data: justTareasData },
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
        .gte("fecha", inicioUtc.toISOString().substring(0, 10)),
      supabase
        .from("horario_excepciones")
        .select("*")
        .in("trabajador_id", ids)
        .gte("fecha", inicioUtc.toISOString().substring(0, 10))
        .eq("es_dia_libre", true),
      supabase.from("tareas").select("*").in("trabajador_id", ids),
      supabase.from("tareas_completadas").select("*").in("trabajador_id", ids),
      supabase.from("tareas_justificadas").select("*").in("trabajador_id", ids),
    ]);

    if (errM || errH) {
      setError(errM?.message ?? errH?.message ?? "Error al cargar datos");
      setCargando(false);
      return;
    }

    const marcas = (marcasData ?? []) as Marca[];
    const horarios = (horariosData ?? []) as Horario[];
    const faltasJust = (faltasJustData ?? []) as FaltaJustificada[];
    const excepciones = (excepcionesData ?? []) as HorarioExcepcion[];
    const tareas = (tareasData ?? []) as Tarea[];
    const completadas = (completadasData ?? []) as TareaCompletada[];
    const tareasJust = (justTareasData ?? []) as TareaJustificada[];

    const resultado: FilaReporte[] = (trabajadores as Trabajador[]).map((t) => {
      const misMarcas = marcas.filter((m) => m.trabajador_id === t.id);
      const misHorarios = horarios.filter((h) => h.trabajador_id === t.id);
      const misFaltasJust = faltasJust.filter((f) => f.trabajador_id === t.id);
      const misExcepciones = excepciones.filter((e) => e.trabajador_id === t.id);
      const diasExcluidos = buildDiasExcluidos(misFaltasJust, misExcepciones);
      const misTareas = tareas.filter((x) => x.trabajador_id === t.id);
      const misCompletadas = completadas.filter((x) => x.trabajador_id === t.id);
      const misTareasJust = tareasJust.filter((x) => x.trabajador_id === t.id);
      const resumen = calcularResumenMes(misMarcas, misHorarios, t.tarifa_hora, bonoReal, diasExcluidos, undefined, undefined, misTareas, misCompletadas, sancionReal, misTareasJust);
      return {
        trabajador: t,
        resumen,
        marcasMes: misMarcas,
        faltasJustificadas: misFaltasJust,
        tareas: misTareas,
        completadas: misCompletadas,
        tareasJustificadas: misTareasJust,
      };
    });

    setFilas(resultado);
    setCargando(false);
  };

  const granTotalSueldo = filas.reduce((acc, f) => acc + f.resumen.totalSueldo, 0);
  const granTotalBonos = filas.reduce((acc, f) => acc + f.resumen.bono, 0);
  const granTotal = filas.reduce((acc, f) => acc + f.resumen.totalConBono, 0);
  const granTotalSancionTareas = filas.reduce((acc, f) => acc + f.resumen.montoSancionTareas, 0);
  const trabajadoresConBono = filas.filter((f) => f.resumen.ganoBonoMes).length;

  const filaDetalle = detalleId ? filas.find((f) => f.trabajador.id === detalleId) ?? null : null;

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
          <p className="text-sm font-semibold text-white">Reporte mensual</p>
          <span className="w-14" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        <div>
          <h1 className="text-lg font-bold text-navy-700">{nombreMes()}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Del 1 al dia de hoy &middot; Bono: {pesos(montoBono)} por cero faltas, retardos y tareas pendientes
            {Number(sancionTarea) > 0 && (
              <> &middot; Descuento {pesos(Number(sancionTarea))} por tarea no hecha</>
            )}
          </p>
        </div>

        {cargando && <p className="text-sm text-slate-400">Calculando reporte mensual...</p>}

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
                montoBono={montoBono}
                onDetalle={() => setDetalleId(trabajador.id)}
              />
            ))}
          </div>
        )}

        {!cargando && filas.length > 0 && (
          <div className="card border-t-2 border-marca-500 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="label-section">Total a pagar</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {filas.length} trabajador{filas.length !== 1 ? "es" : ""} &middot; {trabajadoresConBono} bono{trabajadoresConBono !== 1 ? "s" : ""}
                </p>
              </div>
              <p className="text-2xl font-bold text-navy-700">{pesos(granTotal)}</p>
            </div>
            <div className="border-t border-slate-100 pt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="label-section">Sueldos</p>
                <p className="mt-0.5 font-semibold text-slate-700">{pesos(granTotalSueldo)}</p>
              </div>
              <div className="text-right">
                <p className="label-section">Bonos</p>
                <p className={`mt-0.5 font-semibold ${granTotalBonos > 0 ? "text-marca-600" : "text-slate-400"}`}>
                  {pesos(granTotalBonos)}
                </p>
              </div>
            </div>
            {granTotalSancionTareas > 0 && (
              <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
                <p className="label-section">Descuento por tareas</p>
                <p className="font-semibold text-amber-600">- {pesos(granTotalSancionTareas)}</p>
              </div>
            )}
          </div>
        )}
      </main>

      {filaDetalle && (
        <ModalDetalle
          fila={filaDetalle}
          montoBono={montoBono}
          onClose={() => setDetalleId(null)}
          onActualizado={cargar}
        />
      )}
    </div>
  );
}

function TarjetaTrabajador({
  trabajador,
  resumen,
  montoBono,
  onDetalle,
}: {
  trabajador: Trabajador;
  resumen: ResumenMes;
  montoBono: number;
  onDetalle: () => void;
}) {
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-navy-700">{trabajador.nombre}</p>
          <p className="mt-0.5 text-xs text-slate-400">{pesos(trabajador.tarifa_hora)}/h</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-marca-600 tabular-nums">
            {pesos(resumen.totalConBono)}
          </p>
          {resumen.bono > 0 && (
            <p className="text-[11px] text-marca-500">incl. bono {pesos(montoBono)}</p>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 border-t border-slate-100 pt-4">
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
        <div className="border-l border-slate-100 text-center">
          <p className="label-section">Sin hacer</p>
          <p className={`mt-1 text-lg font-bold tabular-nums ${resumen.tareasIncompletas > 0 ? "text-amber-600" : "text-navy-700"}`}>
            {resumen.tareasIncompletas}
          </p>
        </div>
      </div>

      <div className={`mt-4 flex items-center justify-between rounded-lg px-3 py-2 ${resumen.ganoBonoMes ? "bg-emerald-50" : "bg-slate-50"}`}>
        <div className="flex items-center gap-2">
          {resumen.ganoBonoMes ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          )}
          <p className={`text-xs font-semibold ${resumen.ganoBonoMes ? "text-emerald-700" : "text-slate-500"}`}>
            Bono mensual
          </p>
        </div>
        <div className="flex items-center gap-2">
          <p className={`text-sm font-bold tabular-nums ${resumen.ganoBonoMes ? "text-emerald-700" : "text-slate-400"}`}>
            {resumen.ganoBonoMes ? `+ ${pesos(montoBono)}` : "No ganado"}
          </p>
          <button
            onClick={onDetalle}
            className="rounded-lg bg-white px-2 py-1 text-[11px] font-medium text-navy-600 ring-1 ring-slate-200 transition hover:ring-navy-300"
          >
            Justificar
          </button>
        </div>
      </div>
      {resumen.montoSancionTareas > 0 && (
        <p className="mt-2 text-right text-xs font-medium text-amber-600">
          Descuento por {resumen.tareasIncompletas} tarea{resumen.tareasIncompletas !== 1 ? "s" : ""} sin hacer: - {pesos(resumen.montoSancionTareas)}
        </p>
      )}
    </div>
  );
}

type NuevaFaltaForm = { fecha: string; nota: string };

function ModalDetalle({
  fila,
  montoBono,
  onClose,
  onActualizado,
}: {
  fila: FilaReporte;
  montoBono: number;
  onClose: () => void;
  onActualizado: () => Promise<void>;
}) {
  const [guardando, setGuardando] = useState(false);
  const [nuevaFalta, setNuevaFalta] = useState<NuevaFaltaForm>({ fecha: "", nota: "" });
  const [mostrarFormFalta, setMostrarFormFalta] = useState(false);

  const retardosActuales = fila.marcasMes.filter(
    (m) => m.tipo === "entrada" && m.nota === "retardo",
  );

  const tareasSinHacer = detalleTareasIncompletas(
    fila.tareas,
    fila.completadas,
    fila.tareasJustificadas,
    fila.marcasMes,
  );

  const tituloTarea = (id: string) =>
    fila.tareas.find((t) => t.id === id)?.titulo ?? "Tarea";

  const justificarTarea = async (item: TareaIncompleta) => {
    setGuardando(true);
    await supabase.from("tareas_justificadas").insert({
      trabajador_id: fila.trabajador.id,
      tarea_id: item.tareaId,
      periodo: item.periodo,
    });
    await onActualizado();
    setGuardando(false);
  };

  const quitarJustTarea = async (id: string) => {
    setGuardando(true);
    await supabase.from("tareas_justificadas").delete().eq("id", id);
    await onActualizado();
    setGuardando(false);
  };

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
            <p className="text-xs text-slate-500">Justificar retardos y faltas del mes</p>
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
          <div className={`flex items-center justify-between rounded-lg px-4 py-3 ${fila.resumen.ganoBonoMes ? "bg-emerald-50" : "bg-amber-50"}`}>
            <p className={`text-sm font-semibold ${fila.resumen.ganoBonoMes ? "text-emerald-700" : "text-amber-700"}`}>
              {fila.resumen.ganoBonoMes
                ? "Bono ganado este mes"
                : `Sin bono: ${fila.resumen.retardos} retardo${fila.resumen.retardos !== 1 ? "s" : ""} / ${fila.resumen.faltas} falta${fila.resumen.faltas !== 1 ? "s" : ""} / ${fila.resumen.tareasIncompletas} tarea${fila.resumen.tareasIncompletas !== 1 ? "s" : ""} sin hacer`}
            </p>
            <p className={`text-sm font-bold tabular-nums ${fila.resumen.ganoBonoMes ? "text-emerald-700" : "text-amber-700"}`}>
              {fila.resumen.ganoBonoMes ? `+ ${pesos(montoBono)}` : pesos(0)}
            </p>
          </div>

          <div>
            <p className="label-section mb-2">Retardos del mes</p>
            {retardosActuales.length === 0 ? (
              <p className="text-xs text-slate-400">Sin retardos registrados.</p>
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
                        {fechaCorta(m.marcado_en)}
                      </p>
                      <p className="text-xs text-slate-400">
                        Entrada a las {horaCorta(m.marcado_en)}
                        {m.justificada && " - Justificado"}
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
              <p className="text-xs text-slate-400">Sin faltas justificadas este mes.</p>
            ) : (
              <div className="space-y-2">
                {fila.faltasJustificadas.map((fj) => (
                  <div
                    key={fj.id}
                    className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2.5 ring-1 ring-emerald-200"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        {fechaCorta(fj.fecha)}
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

          <div>
            <p className="label-section mb-2">Tareas sin hacer del mes</p>
            {tareasSinHacer.length === 0 ? (
              <p className="text-xs text-slate-400">
                Sin tareas pendientes de periodos cerrados.
              </p>
            ) : (
              <div className="space-y-2">
                {tareasSinHacer.map((item) => (
                  <div
                    key={`${item.tareaId}|${item.periodo}`}
                    className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2.5 ring-1 ring-amber-200"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-700">{item.titulo}</p>
                      <p className="text-xs text-slate-400">
                        {item.frecuencia === "semanal" ? "Semana del " : ""}
                        {fechaCorta(item.periodo)}
                      </p>
                    </div>
                    <button
                      onClick={() => void justificarTarea(item)}
                      disabled={guardando}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                    >
                      Justificar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {fila.tareasJustificadas.length > 0 && (
            <div>
              <p className="label-section mb-2">Tareas justificadas</p>
              <div className="space-y-2">
                {fila.tareasJustificadas.map((tj) => (
                  <div
                    key={tj.id}
                    className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2.5 ring-1 ring-emerald-200"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        {tituloTarea(tj.tarea_id)}
                      </p>
                      <p className="text-xs text-slate-400">{fechaCorta(tj.periodo)}</p>
                    </div>
                    <button
                      onClick={() => void quitarJustTarea(tj.id)}
                      disabled={guardando}
                      className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:ring-rose-300 hover:text-rose-600"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={onClose} className="btn-secondary w-full">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
