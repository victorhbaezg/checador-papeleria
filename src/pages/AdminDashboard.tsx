import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

type IconoKey = "trabajadores" | "configuracion" | "semanal" | "mensual";

type Tile = {
  to?: string;
  titulo: string;
  descripcion: string;
  proximamente?: boolean;
  icono: IconoKey;
};

const TILES: Tile[] = [
  {
    to: "/admin/trabajadores",
    titulo: "Trabajadores",
    descripcion: "Alta, edicion, tarifas y horarios",
    icono: "trabajadores",
  },
  {
    to: "/admin/configuracion",
    titulo: "Configuracion",
    descripcion: "QR del local, tolerancia y bono",
    icono: "configuracion",
  },
  {
    titulo: "Reporte semanal",
    descripcion: "Horas y pago de la semana",
    proximamente: true,
    icono: "semanal",
  },
  {
    titulo: "Reporte mensual",
    descripcion: "Bono mensual de $250",
    proximamente: true,
    icono: "mensual",
  },
];

function Icono({ tipo }: { tipo: IconoKey }) {
  const props = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (tipo) {
    case "trabajadores":
      return (
        <svg {...props}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "configuracion":
      return (
        <svg {...props}>
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
      );
    case "semanal":
      return (
        <svg {...props}>
          <path d="M8 2v4" />
          <path d="M16 2v4" />
          <rect width="18" height="18" x="3" y="4" rx="2" />
          <path d="M3 10h18" />
        </svg>
      );
    case "mensual":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M14.8 9a2 2 0 0 0-1.8-1h-2a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-2a2 2 0 0 1-1.8-1" />
          <path d="M12 6v2" />
          <path d="M12 16v2" />
        </svg>
      );
  }
}

export default function AdminDashboard() {
  const { trabajador, cerrarSesion } = useAuth();

  if (!trabajador) return null;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-navy-700">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-navy-200">
              Administracion
            </p>
            <p className="text-sm font-semibold text-white">{trabajador.nombre}</p>
          </div>
          <div className="flex gap-4">
            <Link to="/" className="text-sm font-medium text-navy-100 transition hover:text-white">
              Inicio
            </Link>
            <button
              onClick={cerrarSesion}
              className="text-sm font-medium text-navy-100 transition hover:text-white"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-xl font-bold text-navy-700">Panel de administracion</h1>
          <p className="mt-1 text-sm text-slate-500">
            Gestiona el equipo, el QR del local y los reportes.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {TILES.map((tile) => {
            const habilitado = tile.to && !tile.proximamente;
            const contenido = (
              <>
                <div className="flex items-start justify-between">
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      habilitado ? "bg-navy-50 text-navy-700" : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    <Icono tipo={tile.icono} />
                  </span>
                  {tile.proximamente && (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Pronto
                    </span>
                  )}
                </div>
                <h2 className="mt-3 text-sm font-semibold text-slate-900">{tile.titulo}</h2>
                <p className="mt-1 text-xs text-slate-500">{tile.descripcion}</p>
              </>
            );

            if (habilitado) {
              return (
                <Link
                  key={tile.titulo}
                  to={tile.to!}
                  className="card transition hover:ring-navy-300"
                >
                  {contenido}
                </Link>
              );
            }

            return (
              <div key={tile.titulo} className="card opacity-70">
                {contenido}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
