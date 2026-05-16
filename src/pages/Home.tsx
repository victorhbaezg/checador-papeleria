import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabase, type Marca } from "../lib/supabase";
import { fechaHoyMx, formatoHoraMx, inicioSemanaMx } from "../lib/marcado";

type ResumenHoy = {
  entrada: Marca | null;
  salida: Marca | null;
};

export default function Home() {
  const { trabajador, cerrarSesion } = useAuth();

  const [resumenHoy, setResumenHoy] = useState<ResumenHoy>({ entrada: null, salida: null });
  const [horasSemana, setHorasSemana] = useState<number>(0);
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
    // La última salida del día gana, por si hubo varias
    const salida = [...marcasHoy].reverse().find((m) => m.tipo === "salida") ?? null;
    setResumenHoy({ entrada, salida });

    // Horas acumuladas en la semana: leemos todas las marcas de la semana y
    // emparejamos entrada+salida por día. Es un cálculo simple en cliente que
    // basta para 5 trabajadores; cuando llegue el reporte real, se hace en SQL.
    const { data: marcasSemanaData } = await supabase
      .from("marcas")
      .select("*")
      .eq("trabajador_id", trabajadorId)
      .gte("marcado_en", inicioSemanaUtc.toISOString())
      .order("marcado_en", { ascending: true });

    const horas = calcularHorasSemana((marcasSemanaData ?? []) as Marca[]);
    setHorasSemana(horas);

    setCargandoResumen(false);
  };

  if (!trabajador) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">Bienvenido</p>
            <p className="text-base font-semibold text-slate-900">{trabajador.nombre}</p>
          </div>
          <button onClick={cerrarSesion} className="text-sm text-slate-500 hover:text-slate-900">
            Salir
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-8 space-y-6">
        {/* Boton grande de marcar */}
        <div className="card text-center">
          <p className="mb-4 text-sm text-slate-500">Marcar mi asistencia</p>
          <Link to="/marcar" className="btn-primary block w-full py-6 text-lg">
            📷 Marcar entrada / salida
          </Link>
          <p className="mt-3 text-xs text-slate-400">
            Escanea el QR del local para registrar.
          </p>
        </div>

        {/* Resumen de hoy */}
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Hoy</h2>
          {cargandoResumen ? (
            <p className="text-sm text-slate-400">Cargando…</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <RecuadroMarca label="Entrada" marca={resumenHoy.entrada} />
              <RecuadroMarca label="Salida" marca={resumenHoy.salida} />
            </div>
          )}
        </div>

        {/* Resumen semana */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">Esta semana</h2>
              <p className="text-xs text-slate-400">Lunes a hoy</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-slate-900">
                {cargandoResumen ? "…" : horasSemana.toFixed(1)}
              </p>
              <p className="text-xs text-slate-500">horas</p>
            </div>
          </div>
          <Link
            to="/mis-marcas"
            className="mt-4 block text-center text-sm font-medium text-marca-700 hover:underline"
          >
            Ver detalle de la semana →
          </Link>
        </div>

        {trabajador.es_admin && (
          <Link
            to="/admin"
            className="block rounded-2xl bg-marca-50 px-6 py-4 text-center text-marca-700 ring-1 ring-marca-500/20 hover:bg-marca-50/80"
          >
            Ir al panel de administración →
          </Link>
        )}
      </main>
    </div>
  );
}

function RecuadroMarca({ label, marca }: { label: string; marca: Marca | null }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <p className="text-xs text-slate-500">{label}</p>
      {marca ? (
        <p className="mt-1 text-xl font-semibold text-slate-900">
          {formatoHoraMx(marca.marcado_en)}
        </p>
      ) : (
        <p className="mt-1 text-xl text-slate-300">—</p>
      )}
    </div>
  );
}

/**
 * Suma de horas trabajadas en la semana actual a partir de marcas crudas.
 * Empareja la PRIMERA entrada con la ÚLTIMA salida de cada día.
 * Si un día tiene entrada sin salida, ese día aún no cuenta.
 */
function calcularHorasSemana(marcas: Marca[]): number {
  // Agrupar por fecha local (CDMX). Como `inicioSemanaMx` ya filtró, basta
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
