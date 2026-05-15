import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

type Tile = {
  to?: string;
  titulo: string;
  descripcion: string;
  proximamente?: boolean;
  icono: string;
};

const TILES: Tile[] = [
  {
    to: "/admin/trabajadores",
    titulo: "Trabajadores",
    descripcion: "Alta, edición, tarifas y horarios",
    icono: "👥",
  },
  {
    to: "/admin/configuracion",
    titulo: "Configuración",
    descripcion: "QR del local, tolerancia y bono",
    icono: "🔳",
  },
  {
    titulo: "Reporte semanal",
    descripcion: "Horas y pago de la semana",
    proximamente: true,
    icono: "📅",
  },
  {
    titulo: "Reporte mensual",
    descripcion: "Bono mensual de $250",
    proximamente: true,
    icono: "💰",
  },
];

export default function AdminDashboard() {
  const { trabajador, cerrarSesion } = useAuth();

  if (!trabajador) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">Administración</p>
            <p className="text-base font-semibold text-slate-900">{trabajador.nombre}</p>
          </div>
          <div className="flex gap-3">
            <Link to="/" className="text-sm text-slate-500 hover:text-slate-900">
              Inicio
            </Link>
            <button onClick={cerrarSesion} className="text-sm text-slate-500 hover:text-slate-900">
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Panel de administración</h1>
          <p className="mt-1 text-sm text-slate-500">
            Gestiona el equipo, el QR del local y los reportes.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {TILES.map((tile) => {
            const contenido = (
              <>
                <div className="flex items-start justify-between">
                  <span className="text-2xl">{tile.icono}</span>
                  {tile.proximamente && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Pronto
                    </span>
                  )}
                </div>
                <h2 className="mt-3 text-sm font-semibold text-slate-800">{tile.titulo}</h2>
                <p className="mt-1 text-xs text-slate-500">{tile.descripcion}</p>
              </>
            );

            if (tile.to && !tile.proximamente) {
              return (
                <Link
                  key={tile.titulo}
                  to={tile.to}
                  className="card transition hover:shadow-md hover:ring-marca-500/40"
                >
                  {contenido}
                </Link>
              );
            }

            return (
              <div key={tile.titulo} className="card opacity-60">
                {contenido}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
