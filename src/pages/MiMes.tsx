import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabase, type Marca, type Horario } from "../lib/supabase";
import { ZONA_HORARIA } from "../lib/marcado";
import { inicioMesMx, calcularResumenMes, type ResumenMes } from "../lib/reporte";
import { pesos } from "../lib/dias";

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

export default function MiMes() {
  const { trabajador } = useAuth();
  const [resumen, setResumen] = useState<ResumenMes | null>(null);
  const [montoBono, setMontoBono] = useState(250);
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

    const inicioUtc = inicioMesMx();

    const [
      { data: config },
      { data: marcasData, error: errM },
      { data: horariosData, error: errH },
    ] = await Promise.all([
      supabase.from("configuracion").select("monto_bono_mensual").single(),
      supabase
        .from("marcas")
        .select("*")
        .eq("trabajador_id", trabajadorId)
        .gte("marcado_en", inicioUtc.toISOString())
        .order("marcado_en", { ascending: true }),
      supabase.from("horarios").select("*").eq("trabajador_id", trabajadorId),
    ]);

    if (errM || errH) {
      setError(errM?.message ?? errH?.message ?? "Error al cargar datos");
      setCargando(false);
      return;
    }

    const bonoReal =
      (config as { monto_bono_mensual: number } | null)?.monto_bono_mensual ?? 250;
    setMontoBono(bonoReal);

    const marcas = (marcasData ?? []) as Marca[];
    const horarios = (horariosData ?? []) as Horario[];

    setResumen(
      calcularResumenMes(marcas, horarios, trabajador?.tarifa_hora ?? 0, bonoReal),
    );
    setCargando(false);
  };

  if (!trabajador) return null;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-navy-700">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-4">
          <Link
            to="/mis-marcas"
            className="flex items-center gap-1 text-sm font-medium text-navy-100 transition hover:text-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            Mi semana
          </Link>
          <p className="text-sm font-semibold text-white">Mi mes</p>
          <span className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 py-6">
        {/* Encabezado de mes */}
        <div>
          <h1 className="text-lg font-bold text-navy-700">{nombreMes()}</h1>
          <p className="mt-0.5 text-sm text-slate-500">Del 1 al dia de hoy</p>
        </div>

        {cargando && (
          <p className="text-sm text-slate-400">Calculando tu mes...</p>
        )}

        {error && (
          <div className="rounded-lg bg-rose-50 p-5 text-sm text-rose-700 ring-1 ring-rose-200">
            {error}
          </div>
        )}

        {!cargando && !error && resumen && (
          <>
            {/* Metricas del mes */}
            <div className="card grid grid-cols-3 gap-2">
              <div className="text-center">
                <p className="label-section">Horas</p>
                <p className="mt-1 text-2xl font-bold text-marca-600 tabular-nums">
                  {resumen.horasTrabajadas.toFixed(1)}
                </p>
              </div>
              <div className="border-l border-slate-100 text-center">
                <p className="label-section">Retardos</p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${resumen.retardos > 0 ? "text-amber-600" : "text-navy-700"}`}>
                  {resumen.retardos}
                </p>
              </div>
              <div className="border-l border-slate-100 text-center">
                <p className="label-section">Faltas</p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${resumen.faltas > 0 ? "text-rose-600" : "text-navy-700"}`}>
                  {resumen.faltas}
                </p>
              </div>
            </div>

            {/* Estado del bono */}
            <div className={`card border-l-4 ${resumen.ganoBonoMes ? "border-l-emerald-500" : "border-l-slate-300"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-full ${resumen.ganoBonoMes ? "bg-emerald-100" : "bg-slate-100"}`}>
                    {resumen.ganoBonoMes ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v4" />
                        <path d="M12 16h.01" />
                      </svg>
                    )}
                  </span>
                  <div>
                    <p className={`text-sm font-semibold ${resumen.ganoBonoMes ? "text-emerald-700" : "text-slate-600"}`}>
                      {resumen.ganoBonoMes ? "Bono ganado" : "Bono no ganado"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {resumen.ganoBonoMes
                        ? "Sin faltas ni retardos este mes"
                        : `${resumen.faltas} falta${resumen.faltas !== 1 ? "s" : ""} / ${resumen.retardos} retardo${resumen.retardos !== 1 ? "s" : ""}`}
                    </p>
                  </div>
                </div>
                <p className={`text-xl font-bold tabular-nums ${resumen.ganoBonoMes ? "text-emerald-700" : "text-slate-400"}`}>
                  {resumen.ganoBonoMes ? `+${pesos(montoBono)}` : pesos(0)}
                </p>
              </div>
            </div>

            {/* Sueldo estimado */}
            {trabajador.tarifa_hora > 0 && (
              <div className="card border-t-2 border-marca-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="label-section">Estimado del mes</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {resumen.horasTrabajadas.toFixed(1)} h x {pesos(trabajador.tarifa_hora)}/h
                      {resumen.ganoBonoMes ? ` + bono ${pesos(montoBono)}` : ""}
                    </p>
                  </div>
                  <p className="text-2xl font-bold text-navy-700 tabular-nums">
                    {pesos(resumen.totalConBono)}
                  </p>
                </div>
                <p className="mt-2 text-[11px] text-slate-400">
                  Solo incluye dias con entrada y salida registradas.
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
