import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabase, type Marca } from "../lib/supabase";
import { formatoFechaCorta, formatoHoraMx, inicioSemanaMx } from "../lib/marcado";

/** Una fila por día con la información que mostramos al trabajador. */
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
    const { data, error: errMarcas } = await supabase
      .from("marcas")
      .select("*")
      .eq("trabajador_id", trabajadorId)
      .gte("marcado_en", inicioUtc.toISOString())
      .order("marcado_en", { ascending: true });

    if (errMarcas) {
      setError(errMarcas.message);
      setCargando(false);
      return;
    }

    setDias(agruparPorDia((data ?? []) as Marca[]));
    setCargando(false);
  };

  if (!trabajador) return null;

  const totalHoras = dias.reduce((acc, d) => acc + (d.horas ?? 0), 0);
  const totalRetardos = dias.filter((d) => d.fueRetardo).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <Link to="/" className="text-sm text-slate-500 hover:text-slate-900">
            ← Atrás
          </Link>
          <p className="text-base font-semibold text-slate-900">Mi semana</p>
          <span className="w-12" />
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-6 space-y-4">
        {/* Totales arriba */}
        <div className="card grid grid-cols-2 gap-3 text-center">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Horas</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">{totalHoras.toFixed(1)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Retardos</p>
            <p
              className={`mt-1 text-3xl font-bold ${
                totalRetardos > 0 ? "text-amber-600" : "text-slate-900"
              }`}
            >
              {totalRetardos}
            </p>
          </div>
        </div>

        {/* Lista de días */}
        {cargando && <p className="text-sm text-slate-400">Cargando marcas…</p>}

        {error && (
          <div className="card border border-rose-200 bg-rose-50 text-sm text-rose-700">
            {error}
          </div>
        )}

        {!cargando && !error && dias.length === 0 && (
          <div className="card text-center text-sm text-slate-500">
            Todavía no hay marcas esta semana. Cuando marques entrada o salida, aparecerán aquí.
          </div>
        )}

        {!cargando && dias.length > 0 && (
          <div className="space-y-2">
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
        <p className="text-sm font-semibold capitalize text-slate-900">
          {formatoFechaCorta(`${dia.fechaLocal}T12:00:00.000Z`)}
        </p>
        {dia.fueRetardo && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            Retardo
          </span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
        <div>
          <p className="text-xs text-slate-400">Entrada</p>
          <p className="text-slate-900">
            {dia.entrada ? formatoHoraMx(dia.entrada.marcado_en) : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Salida</p>
          <p className="text-slate-900">
            {dia.salida ? formatoHoraMx(dia.salida.marcado_en) : "—"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Horas</p>
          <p className="text-slate-900">
            {dia.horas === null ? "—" : dia.horas.toFixed(1)}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Agrupa marcas por fecha local (CDMX) y calcula:
 * - entrada: primera del día
 * - salida: última del día
 * - horas: diferencia (null si todavía no hay salida)
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

  // Ordenar de más reciente a más antiguo
  filas.sort((a, b) => (a.fechaLocal < b.fechaLocal ? 1 : -1));
  return filas;
}
