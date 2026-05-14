import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function Home() {
  const { trabajador, cerrarSesion } = useAuth();

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
          <button
            disabled
            className="btn-primary w-full py-6 text-lg"
            title="Disponible al terminar el flujo de QR"
          >
            📷 Marcar entrada / salida
          </button>
          <p className="mt-3 text-xs text-slate-400">
            Próximamente: escaneo del QR del local.
          </p>
        </div>

        {/* Resumen rapido */}
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Esta semana</h2>
          <p className="text-sm text-slate-500">
            Tus registros y horas aparecerán aquí cuando empieces a marcar.
          </p>
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
