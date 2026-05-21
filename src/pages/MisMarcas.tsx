import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabase, type Marca, type Horario } from "../lib/supabase";
import { formatoFechaCorta, formatoHoraMx, inicioSemanaMx } from "../lib/marcado";
import { calcularResumenSemana, type ResumenSemana } from "../lib/reporte";
import { pesos } from "../lib/dias";

/** Una fila por dia con la informacion que mostramos al trabajador. */
type ResumenDia = {
  fechaLocal: string; // "YYYY-MM-DD" en CDMX
  entrada: Marca | null;
  salida: Marca | null;
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

  const cargar = async (trabajadorId: string) => {
    setCargando(true);
    setError(null);

    const inicioUtc = inicioSemanaMx();

    const [{ data: marcasData, error: errMarcas }, { data: horariosData, error: errHorarios }] =
      await Promise.all([
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
      ]);

    if (errMarcas || errHorarios) {
      setError(errMarcas?.message ?? errHorarios?.message ?? "Error al cargar datos");
      setCargando(false);
      return;
    }

    const marcas = (marcasData ?? []) as Marca[];
    const horarios = (horariosData ?? []) as Horario[];

    setDias(agruparPorDia(marcas));
    setResumen(
      calcularResumenSemana(marcas, horarios, trabajador?.tarifa_hora ?? 0),
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
            <p className="mt-2 text-[11px] text-slate-400">
              Solo incluye dias con entrada y salida registradas.
            </p>
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

function FilaDia({ dia }: { dia: ResumenDia }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold capitalize text-navy-700">
          {formatoFechaCorta(`${dia.fechaLocal}T12:00:00.000Z`)}
        </p>
        {dia.fueRetardo && (
          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            Retardo
          </span>
        )}
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
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Horas</p>
          <p className="mt-0.5 text-sm font-semibold text-marca-600">
            {dia.horas === null ? "--" : dia.horas.toFixed(1)}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Agrupa marcas por fecha local (CDMX) y calcula:
 * - entrada: primera del dia
 * - salida: ultima del dia
 * - horas: diferencia (null si todavia no hay salida)
 * - fueRetardo: la marca de entrada trae nota='retardo'
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

  const filas: ResumenDia[] = [];
  for (const [fechaLocal, lista] of porDia.entries()) {
    const entradas = lista.filter((m) => m.tipo === "entrada");
    const salidas = lista.filter((m) => m.tipo === "salida");
    const entrada = entradas[0] ?? null;
    const salida = salidas[salidas.length - 1] ?? null;
    let horas: number | null = null;
    if (entrada && salida) {
      const ms =
        new Date(salida.marcado_en).getTime() - new Date(entrada.marcado_en).getTime();
      if (ms > 0) horas = ms / (1000 * 60 * 60);
    }
    const fueRetardo = entrada?.nota === "retardo";
    filas.push({ fechaLocal, entrada, salida, horas, fueRetardo });
  }

  // Ordenar de mas reciente a mas antiguo
  filas.sort((a, b) => (a.fechaLocal < b.fechaLocal ? 1 : -1));
  return filas;
}
