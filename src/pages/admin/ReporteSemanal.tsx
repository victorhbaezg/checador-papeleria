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
};

/** Formatea una fecha UTC como "lun 19 may" en zona Mexico. */
function fechaCorta(d: Date): string {
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
      const diasExcluidos = buildDiasExcluidos(faltasJust, excepciones, t.id);
      const resumen = calcularResumenSemana(misMarcas, misHorarios, t.tarifa_hora, diasExcluidos);
      return { trabajador: t, resumen };
    });

    setFilas(resultado);
    setCargando(false);
  };

  const granTotal = filas.reduce((acc, f) => acc + f.resumen.totalPago, 0);
  const granHoras = filas.reduce((acc, f) => acc + f.resumen.horasTrabajadas, 0);

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
    </div>
  );
}

function TarjetaTrabajador({
  trabajador,
  resumen,
}: {
  trabajador: Trabajador;
  resumen: ResumenSemana;
}) {
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
          <p
            className={`mt-1 text-lg font-bold tabular-nums ${
              resumen.retardos > 0 ? "text-amber-600" : "text-navy-700"
            }`}
          >
            {resumen.retardos}
          </p>
        </div>
        <div className="border-l border-slate-100 text-center">
          <p className="label-section">Faltas</p>
          <p
            className={`mt-1 text-lg font-bold tabular-nums ${
              resumen.faltas > 0 ? "text-rose-600" : "text-navy-700"
            }`}
          >
            {resumen.faltas}
          </p>
        </div>
      </div>

      {resumen.horasTrabajadas === 0 && resumen.faltas === 0 && (
        <p className="mt-3 text-center text-xs text-slate-400">
          Sin horas completadas esta semana
        </p>
      )}
    </div>
  );
}
