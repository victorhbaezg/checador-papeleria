import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, type Trabajador, type Marca, type Horario } from "../../lib/supabase";
import { ZONA_HORARIA } from "../../lib/marcado";
import { inicioMesMx, calcularResumenMes, type ResumenMes } from "../../lib/reporte";
import { pesos } from "../../lib/dias";

type FilaReporte = {
  trabajador: Trabajador;
  resumen: ResumenMes;
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

export default function ReporteMensual() {
  const [filas, setFilas] = useState<FilaReporte[]>([]);
  const [montoBono, setMontoBono] = useState(250);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void cargar();
  }, []);

  const cargar = async () => {
    setCargando(true);
    setError(null);

    // Cargar configuracion para leer el monto del bono real
    const { data: config } = await supabase
      .from("configuracion")
      .select("monto_bono_mensual")
      .single();
    const bonoReal = (config as { monto_bono_mensual: number } | null)?.monto_bono_mensual ?? 250;
    setMontoBono(bonoReal);

    // Todos los trabajadores activos
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

    // Marcas del mes + horarios en paralelo
    const [{ data: marcasData, error: errM }, { data: horariosData, error: errH }] =
      await Promise.all([
        supabase
          .from("marcas")
          .select("*")
          .in("trabajador_id", ids)
          .gte("marcado_en", inicioUtc.toISOString())
          .order("marcado_en", { ascending: true }),
        supabase
          .from("horarios")
          .select("*")
          .in("trabajador_id", ids),
      ]);

    if (errM || errH) {
      setError(errM?.message ?? errH?.message ?? "Error al cargar datos");
      setCargando(false);
      return;
    }

    const marcas = (marcasData ?? []) as Marca[];
    const horarios = (horariosData ?? []) as Horario[];

    const resultado: FilaReporte[] = (trabajadores as Trabajador[]).map((t) => {
      const misMarcas = marcas.filter((m) => m.trabajador_id === t.id);
      const misHorarios = horarios.filter((h) => h.trabajador_id === t.id);
      const resumen = calcularResumenMes(misMarcas, misHorarios, t.tarifa_hora, bonoReal);
      return { trabajador: t, resumen };
    });

    setFilas(resultado);
    setCargando(false);
  };

  const granTotalSueldo = filas.reduce((acc, f) => acc + f.resumen.totalSueldo, 0);
  const granTotalBonos = filas.reduce((acc, f) => acc + f.resumen.bono, 0);
  const granTotal = filas.reduce((acc, f) => acc + f.resumen.totalConBono, 0);
  const trabajadoresConBono = filas.filter((f) => f.resumen.ganoBonoMes).length;

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
        {/* Encabezado de mes */}
        <div>
          <h1 className="text-lg font-bold text-navy-700">{nombreMes()}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Del 1 al dia de hoy &middot; Bono: {pesos(montoBono)} por cero faltas y retardos
          </p>
        </div>

        {cargando && (
          <p className="text-sm text-slate-400">Calculando reporte mensual...</p>
        )}

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

        {/* Tarjetas por trabajador */}
        {!cargando && !error && filas.length > 0 && (
          <div className="space-y-3">
            {filas.map(({ trabajador, resumen }) => (
              <TarjetaTrabajador
                key={trabajador.id}
                trabajador={trabajador}
                resumen={resumen}
                montoBono={montoBono}
              />
            ))}
          </div>
        )}

        {/* Gran total */}
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
          </div>
        )}
      </main>
    </div>
  );
}

function TarjetaTrabajador({
  trabajador,
  resumen,
  montoBono,
}: {
  trabajador: Trabajador;
  resumen: ResumenMes;
  montoBono: number;
}) {
  return (
    <div className="card">
      {/* Nombre + total con bono */}
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

      {/* Metricas */}
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

      {/* Estado del bono */}
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
        <p className={`text-sm font-bold tabular-nums ${resumen.ganoBonoMes ? "text-emerald-700" : "text-slate-400"}`}>
          {resumen.ganoBonoMes ? `+ ${pesos(montoBono)}` : "No ganado"}
        </p>
      </div>
    </div>
  );
}
