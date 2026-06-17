import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabase, type Marca } from "../lib/supabase";
import { fechaHoyMx, formatoHoraMx, inicioSemanaMx } from "../lib/marcado";
import { cargarTareas } from "../lib/tareas";

type ResumenHoy = {
  entrada: Marca | null;
  salida: Marca | null;
  pausaInicio: Marca | null;
  pausaFin: Marca | null;
};

export default function Home() {
  const { trabajador, cerrarSesion } = useAuth();

  const [resumenHoy, setResumenHoy] = useState<ResumenHoy>({ entrada: null, salida: null, pausaInicio: null, pausaFin: null });
  const [horasSemana, setHorasSemana] = useState<number>(0);
  const [tareas, setTareas] = useState<{ total: number; pendientes: number } | null>(null);
  const [cargandoResumen, setCargandoResumen] = useState(true);

  useEffect(() => {
    if (!trabajador) return;
    void cargarResumen(trabajador.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trabajador?.id]);

  const cargarResumen = async (trabajadorId: string) => {
    setCargandoResumen(true);

    const hoyMx = fechaHoyMx();
    const inicioHoyUtc = new Date(`${hoyMx}T06:00:00.000Z`);
    const finHoyUtc = new Date(inicioHoyUtc.getTime() + 24 * 60 * 60 * 1000);
    const inicioSemanaUtc = inicioSemanaMx();

    // Marcas de hoy (entrada y salida)
    const { data: marcasHoyData } = await supabase
      .from("marcas")
      .select("*")
      .eq("trabajador_id", trabajadorId)
      .gte("marcado_en", inicioHoyUtc.toISOString())
      .lt("marcado_en", finHoyUtc.toISOString())
      .order("marcado_en", { ascending: true });

    const marcasHoy = (marcasHoyData ?? []) as Marca[];
    const entrada = marcasHoy.find((m) => m.tipo === "entrada") ?? null;
    // La ultima salida del dia gana, por si hubo varias
    const salida = [...marcasHoy].reverse().find((m) => m.tipo === "salida") ?? null;
    // Pausa: primer inicio y ultimo fin del dia (si los hay).
    const pausaInicio = marcasHoy.find((m) => m.tipo === "pausa_inicio") ?? null;
    const pausaFin = [...marcasHoy].reverse().find((m) => m.tipo === "pausa_fin") ?? null;
    setResumenHoy({ entrada, salida, pausaInicio, pausaFin });

    // Horas acumuladas en la semana: leemos todas las marcas de la semana y
    // emparejamos entrada+salida por dia. Es un calculo simple en cliente que
    // basta para 5 trabajadores; cuando llegue el reporte real, se hace en SQL.
    const { data: marcasSemanaData } = await supabase
      .from("marcas")
      .select("*")
      .eq("trabajador_id", trabajadorId)
      .gte("marcado_en", inicioSemanaUtc.toISOString())
      .order("marcado_en", { ascending: true });

    const horas = calcularHorasSemana((marcasSemanaData ?? []) as Marca[]);
    setHorasSemana(horas);

    // Tareas pendientes (limpieza/orden)
    try {
      const r = await cargarTareas(trabajadorId);
      setTareas({ total: r.total, pendientes: r.pendientes });
    } catch {
      setTareas(null);
    }

    setCargandoResumen(false);
  };

  if (!trabajador) return null;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-navy-700">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white">
              <svg width="26" height="26" viewBox="6 8 168 212" xmlns="http://www.w3.org/2000/svg">
                <path d="M 106.7 39 A 50 50 0 1 0 106.7 121" fill="none" stroke="#15b9d4" strokeWidth="34" strokeLinecap="butt" />
                <polygon points="80,80 168,80 168,102 122,214 94,214 130,102 80,102" fill="#1d5aa6" />
            </svg>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-navy-200">Cyber 7</p>
              <p className="text-sm font-semibold text-white">{trabajador.nombre}</p>
            </div>
          </div>
          <button
            onClick={cerrarSesion}
            className="text-sm font-medium text-navy-100 transition hover:text-white"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-5 px-4 py-6">
        {/* Marcar asistencia */}
        <div className="card">
          <p className="label-section">Asistencia</p>
          <p className="mb-4 mt-1 text-sm text-slate-600">
            Escanea el QR del local para registrar tu entrada o salida.
          </p>
          <Link to="/marcar" className="btn-primary w-full gap-2 py-4">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="5" height="5" x="3" y="3" rx="1" />
              <rect width="5" height="5" x="16" y="3" rx="1" />
              <rect width="5" height="5" x="3" y="16" rx="1" />
              <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
              <path d="M21 21v.01" />
              <path d="M12 7v3a2 2 0 0 1-2 2H7" />
              <path d="M3 12h.01" />
              <path d="M12 3h.01" />
              <path d="M12 16v.01" />
              <path d="M16 12h1" />
              <path d="M21 12v.01" />
              <path d="M12 21v-1" />
            </svg>
            Marcar entrada / salida
          </Link>
        </div>

        {/* Tareas pendientes */}
        {tareas && tareas.total > 0 && (
          <Link
            to="/tareas"
            className="card flex items-center justify-between transition hover:ring-navy-300"
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  tareas.pendientes === 0
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-amber-50 text-amber-600"
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 12H3" />
                  <path d="M16 6H3" />
                  <path d="M16 18H3" />
                  <path d="m17 12 2 2 4-4" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">Mis tareas</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {tareas.pendientes === 0
                    ? "Todas hechas. Bien hecho."
                    : `${tareas.pendientes} pendiente${tareas.pendientes === 1 ? "" : "s"} de ${tareas.total}`}
                </p>
              </div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
        )}

        {/* Resumen de hoy */}
        <div className="card">
          <p className="label-section">Hoy</p>
          {cargandoResumen ? (
            <p className="mt-3 text-sm text-slate-400">Cargando...</p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <RecuadroMarca label="Entrada" marca={resumenHoy.entrada} />
              <RecuadroMarca label="Salida" marca={resumenHoy.salida} />
              {(resumenHoy.pausaInicio || resumenHoy.pausaFin) && (
                <>
                  <RecuadroMarca label="Inicio de pausa" marca={resumenHoy.pausaInicio} />
                  <RecuadroMarca label="Fin de pausa" marca={resumenHoy.pausaFin} />
                </>
              )}
            </div>
          )}
        </div>

        {/* Resumen semana */}
        <div className="card">
          <div className="flex items-end justify-between">
            <div>
              <p className="label-section">Esta semana</p>
              <p className="mt-1 text-xs text-slate-400">Lunes a hoy</p>
            </div>
            <div className="text-right">
              <span className="text-3xl font-bold leading-none text-marca-600">
                {cargandoResumen ? "..." : horasSemana.toFixed(1)}
              </span>
              <span className="ml-1 text-sm font-medium text-slate-500">h</span>
            </div>
          </div>
          <Link
            to="/mis-marcas"
            className="mt-4 flex items-center justify-center gap-1 border-t border-slate-100 pt-3 text-sm font-medium text-navy-700 hover:text-navy-800"
          >
            Ver detalle de la semana
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
        </div>

        {trabajador.es_admin && (
          <Link
            to="/admin"
            className="flex items-center justify-between rounded-lg bg-white px-5 py-4 ring-1 ring-slate-200 transition hover:ring-navy-300"
          >
            <span className="text-sm font-semibold text-navy-700">
              Panel de administracion
            </span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0f2f5f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
        )}
      </main>
    </div>
  );
}

function RecuadroMarca({ label, marca }: { label: string; marca: Marca | null }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      {marca ? (
        <p className="mt-1 text-xl font-semibold text-slate-900">
          {formatoHoraMx(marca.marcado_en)}
        </p>
      ) : (
        <p className="mt-1 text-xl font-semibold text-slate-300">--:--</p>
      )}
    </div>
  );
}

/**
 * Suma de horas trabajadas en la semana actual a partir de marcas crudas.
 * Empareja la PRIMERA entrada con la ULTIMA salida de cada dia.
 * Si un dia tiene entrada sin salida, ese dia aun no cuenta.
 */
function calcularHorasSemana(marcas: Marca[]): number {
  // Agrupar por fecha local (CDMX). Como `inicioSemanaMx` ya filtro, basta
  // agrupar por la fecha que se ve al pasar a CDMX.
  const porDia = new Map<string, Marca[]>();
  for (const m of marcas) {
    const fechaLocal = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(m.marcado_en)); // "YYYY-MM-DD"
    const arr = porDia.get(fechaLocal) ?? [];
    arr.push(m);
    porDia.set(fechaLocal, arr);
  }

  let total = 0;
  for (const lista of porDia.values()) {
    const entradas = lista.filter((m) => m.tipo === "entrada");
    const salidas = lista.filter((m) => m.tipo === "salida");
    if (entradas.length === 0 || salidas.length === 0) continue;
    const entrada = new Date(entradas[0].marcado_en).getTime();
    const salida = new Date(salidas[salidas.length - 1].marcado_en).getTime();
    if (salida > entrada) {
      total += (salida - entrada) / (1000 * 60 * 60);
    }
  }
  return total;
}
