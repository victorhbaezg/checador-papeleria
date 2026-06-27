import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useRecargarAlVolver } from "../lib/useRecargar";
import {
  supabase,
  type Marca,
  type Horario,
  type FaltaJustificada,
  type HorarioExcepcion,
} from "../lib/supabase";
import { formatoFechaCorta, formatoHoraMx, inicioSemanaMx } from "../lib/marcado";
import { calcularResumenSemana, type ResumenSemana } from "../lib/reporte";
import { pesos } from "../lib/dias";

/** Una fila por dia con la informacion que mostramos al trabajador. */
type ResumenDia = {
  fechaLocal: string; // "YYYY-MM-DD" en CDMX
  entrada: Marca | null;
  salida: Marca | null;
  pausaInicio: Marca | null;
  pausaFin: Marca | null;
  minEntradaTarde: number; // minutos de retardo en la entrada
  minPausaTarde: number; // minutos que regreso tarde de la pausa
  horas: number | null;
  fueRetardo: boolean;
};

export default function MisMarcas() {
  const { trabajador } = useAuth();
  const [dias, setDias] = useState<ResumenDia[]>([]);
  const [resumen, setResumen] = useState<ResumenSemana | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);

    try {
      await cargarDatos(trabajadorId);
    } catch (e) {
      console.error("[MisMarcas] error al cargar:", e);
    } finally {
      setCargando(false);
    }
  };

  const cargarDatos = async (trabajadorId: string) => {
    const inicioUtc = inicioSemanaMx();
    const inicioStr = inicioUtc.toISOString().substring(0, 10);

    const [
      { data: marcasData, error: errMarcas },
      { data: horariosData, error: errHorarios },
      { data: faltasJustData },
      { data: excepcionesData },
      { data: configData },
    ] = await Promise.all([
      supabase
        .from("marcas")
        .select("*")
        .eq("trabajador_id", trabajadorId)
        .gte("marcado_en", inicioUtc.toISOString())
        .order("marcado_en", { ascending: true }),
      supabase
        .from("horarios")
        .select("*")
        .eq("trabajador_id", trabajadorId),
      supabase
        .from("faltas_justificadas")
        .select("*")
        .eq("trabajador_id", trabajadorId)
        .gte("fecha", inicioStr),
      supabase
        .from("horario_excepciones")
        .select("*")
        .eq("trabajador_id", trabajadorId)
        .gte("fecha", inicioStr)
        .eq("es_dia_libre", true),
      supabase.from("configuracion").select("umbral_sancion_minutos").eq("id", 1).single(),
    ]);

    if (errMarcas || errHorarios) {
      setError(errMarcas?.message ?? errHorarios?.message ?? "Error al cargar datos");
      setCargando(false);
      return;
    }

    const marcas = (marcasData ?? []) as Marca[];
    const horarios = (horariosData ?? []) as Horario[];
    const faltasJust = (faltasJustData ?? []) as FaltaJustificada[];
    const excepciones = (excepcionesData ?? []) as HorarioExcepcion[];

    const diasExcluidos = new Set<string>();
    for (const f of faltasJust) diasExcluidos.add(f.fecha);
    for (const e of excepciones) {
      if (e.es_dia_libre) diasExcluidos.add(e.fecha);
    }

    const umbral =
      (configData as { umbral_sancion_minutos: number } | null)?.umbral_sancion_minutos ?? 60;

    setDias(agruparPorDia(marcas));
    setResumen(
      calcularResumenSemana(
        marcas,
        horarios,
        trabajador?.tarifa_hora ?? 0,
        diasExcluidos,
        new Date(),
        umbral,
      ),
    );
    setCargando(false);
  };

  if (!trabajador) return null;

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
          <p className="text-sm font-semibold text-white">Mi semana</p>
          <span className="w-14" />
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 py-6">
        {/* Tarjeta de metricas */}
        <div className="card grid grid-cols-2 gap-3">
          <div className="text-center">
            <p className="label-section">Horas</p>
            <p className="mt-1 text-3xl font-bold text-marca-600">
              {resumen ? resumen.horasTrabajadas.toFixed(1) : "--"}
            </p>
          </div>
          <div className="border-l border-slate-100 text-center">
            <p className="label-section">Retardos</p>
            <p
              className={`mt-1 text-3xl font-bold ${
                (resumen?.retardos ?? 0) > 0 ? "text-amber-600" : "text-navy-700"
              }`}
            >
              {resumen?.retardos ?? "--"}
            </p>
          </div>
          <div className="col-span-2 border-t border-slate-100 pt-3 text-center">
            <p className="label-section">Faltas</p>
            <p
              className={`mt-1 text-2xl font-bold ${
                (resumen?.faltas ?? 0) > 0 ? "text-rose-600" : "text-navy-700"
              }`}
            >
              {resumen?.faltas ?? "--"}
            </p>
          </div>
        </div>

        {/* Estimado de pago */}
        {resumen && trabajador.tarifa_hora > 0 && (
          <div className="card border-t-2 border-marca-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="label-section">Pago estimado</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {resumen.horasTrabajadas.toFixed(1)} h x {pesos(trabajador.tarifa_hora)}/h
                </p>
              </div>
              <p className="text-2xl font-bold text-navy-700">{pesos(resumen.totalPago)}</p>
            </div>
            {resumen.montoDescuento > 0 && (
              <div className="mt-3 flex items-center justify-between border-t border-rose-100 pt-2">
                <p className="text-xs font-medium text-rose-600">
                  Descuento por retardos ({resumen.minutosTarde} min)
                </p>
                <p className="text-sm font-bold text-rose-600 tabular-nums">
                  -{pesos(resumen.montoDescuento)}
                </p>
              </div>
            )}
            <p className="mt-2 text-[11px] text-slate-400">
              Solo incluye dias con entrada y salida registradas.
            </p>
          </div>
        )}

        {/* Aviso de retardos acumulados (aun sin descuento) */}
        {resumen && resumen.minutosTarde > 0 && resumen.montoDescuento === 0 && (
          <div className="rounded-lg bg-amber-50 p-4 text-xs text-amber-700 ring-1 ring-amber-200">
            Llevas {resumen.minutosTarde} min de retardo esta semana. Si llegan a una hora
            acumulada, se descuenta ese tiempo de tu pago.
          </div>
        )}

        {/* Lista de dias */}
        {cargando && <p className="text-sm text-slate-400">Cargando marcas...</p>}

        {error && (
          <div className="rounded-lg bg-rose-50 p-5 text-sm text-rose-700 ring-1 ring-rose-200">
            {error}
          </div>
        )}

        {!cargando && !error && dias.length === 0 && (
          <div className="card text-center text-sm text-slate-500">
            Todavia no hay marcas esta semana. Cuando marques entrada o salida, apareceran aqui.
          </div>
        )}

        {/* Enlace al reporte mensual */}
        {!cargando && (
          <Link
            to="/mi-mes"
            className="card flex items-center justify-between transition hover:ring-navy-300"
          >
            <div>
              <p className="text-sm font-semibold text-navy-700">Ver mi mes</p>
              <p className="mt-0.5 text-xs text-slate-500">Horas, bono y estimado del mes en curso</p>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
        )}

        {!cargando && dias.length > 0 && (
          <div className="space-y-3">
            {dias.map((d) => (
              <FilaDia key={d.fechaLocal} dia={d} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function EstadoMarca({ minutosTarde, etiqueta }: { minutosTarde: number; etiqueta: string }) {
  if (minutosTarde > 0) {
    return (
      <div>
        <p className="text-sm font-semibold text-amber-600">{etiqueta}</p>
        <p className="mt-0.5 text-[11px] font-semibold text-amber-600">+{minutosTarde} min</p>
      </div>
    );
  }
  return <p className="text-sm font-semibold text-emerald-600">A tiempo</p>;
}

function FilaDia({ dia }: { dia: ResumenDia }) {
  const tienePausa = dia.pausaInicio !== null || dia.pausaFin !== null;
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold capitalize text-navy-700">
          {formatoFechaCorta(`${dia.fechaLocal}T12:00:00.000Z`)}
        </p>
        <div className="text-right">
          <span className="text-xl font-bold leading-none text-marca-600">
            {dia.horas === null ? "--" : dia.horas.toFixed(1)}
          </span>
          <span className="ml-1 text-xs font-medium text-slate-500">h</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Entrada</p>
          <p className="mt-0.5 text-sm font-medium text-slate-900">
            {dia.entrada ? formatoHoraMx(dia.entrada.marcado_en) : "--:--"}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Salida</p>
          <p className="mt-0.5 text-sm font-medium text-slate-900">
            {dia.salida ? formatoHoraMx(dia.salida.marcado_en) : "--:--"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Estado</p>
          <div className="mt-0.5">
            {dia.entrada ? (
              <EstadoMarca minutosTarde={dia.minEntradaTarde} etiqueta="Retardo" />
            ) : (
              <p className="text-sm font-medium text-slate-300">--</p>
            )}
          </div>
        </div>
      </div>

      {tienePausa && (
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Inicio pausa
            </p>
            <p className="mt-0.5 text-sm font-medium text-slate-700">
              {dia.pausaInicio ? formatoHoraMx(dia.pausaInicio.marcado_en) : "--:--"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Fin pausa
            </p>
            <p className="mt-0.5 text-sm font-medium text-slate-700">
              {dia.pausaFin ? formatoHoraMx(dia.pausaFin.marcado_en) : "--:--"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Regreso
            </p>
            <div className="mt-0.5">
              <EstadoMarca minutosTarde={dia.minPausaTarde} etiqueta="Tarde" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Agrupa marcas por fecha local (CDMX) y calcula entrada/salida/horas/retardo.
 */
function agruparPorDia(marcas: Marca[]): ResumenDia[] {
  const porDia = new Map<string, Marca[]>();
  for (const m of marcas) {
    const fechaLocal = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(m.marcado_en));
    const arr = porDia.get(fechaLocal) ?? [];
    arr.push(m);
    porDia.set(fechaLocal, arr);
  }

  return Array.from(porDia.entries())
    .sort(([a], [b]) => b.localeCompare(a)) // mas reciente primero
    .map(([fechaLocal, ms]) => {
      const entradas = ms.filter((m) => m.tipo === "entrada");
      const salidas = ms.filter((m) => m.tipo === "salida");
      const pausasInicio = ms.filter((m) => m.tipo === "pausa_inicio");
      const pausasFin = ms.filter((m) => m.tipo === "pausa_fin");
      const entrada = entradas[0] ?? null;
      const salida = salidas[salidas.length - 1] ?? null;
      const minEntradaTarde =
        entrada && entrada.nota === "retardo" && !entrada.justificada
          ? entrada.minutos_tarde ?? 0
          : 0;
      const pausaInicio = pausasInicio[0] ?? null;
      const pausaFin = pausasFin[pausasFin.length - 1] ?? null;

      // Minutos que regreso tarde de la pausa (esos no se cuentan trabajados).
      const minPausaTarde = ms
        .filter(
          (m) =>
            m.tipo === "pausa_fin" &&
            m.nota === "retardo" &&
            !m.justificada &&
            m.minutos_tarde,
        )
        .reduce((s, m) => s + (m.minutos_tarde ?? 0), 0);

      let horas: number | null = null;
      if (entrada && salida) {
        const ms2 =
          new Date(salida.marcado_en).getTime() -
          new Date(entrada.marcado_en).getTime();
        if (ms2 > 0) horas = Math.max(0, ms2 / 3_600_000 - minPausaTarde / 60);
      }

      const fueRetardo =
        entradas.some((m) => m.nota === "retardo" && !m.justificada) ||
        ms.some(
          (m) => m.tipo === "pausa_fin" && m.nota === "retardo" && !m.justificada,
        );

      return { fechaLocal, entrada, salida, pausaInicio, pausaFin, minEntradaTarde, minPausaTarde, horas, fueRetardo };
    });
}
