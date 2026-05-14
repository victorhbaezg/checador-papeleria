import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

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

      <main className="mx-auto max-w-2xl px-4 py-8 space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Panel de administración</h1>
        <p className="text-slate-500">
          Aquí vas a poder dar de alta trabajadores, ver todas las marcas, generar el
          QR del local y exportar reportes. Lo construimos en los próximos pasos.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="card opacity-60">
            <h2 className="text-sm font-semibold text-slate-700">Trabajadores</h2>
            <p className="mt-1 text-xs text-slate-500">Próximamente</p>
          </div>
          <div className="card opacity-60">
            <h2 className="text-sm font-semibold text-slate-700">QR del local</h2>
            <p className="mt-1 text-xs text-slate-500">Próximamente</p>
          </div>
          <div className="card opacity-60">
            <h2 className="text-sm font-semibold text-slate-700">Reporte semanal</h2>
            <p className="mt-1 text-xs text-slate-500">Próximamente</p>
          </div>
          <div className="card opacity-60">
            <h2 className="text-sm font-semibold text-slate-700">Reporte mensual</h2>
            <p className="mt-1 text-xs text-slate-500">Próximamente</p>
          </div>
        </div>
      </main>
    </div>
  );
}
