import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, type Trabajador } from "../../lib/supabase";
import { pesos } from "../../lib/dias";
import { useAuth } from "../../lib/auth";
import ConfirmarEliminarTrabajador from "../../components/ConfirmarEliminarTrabajador";

export default function TrabajadoresList() {
  const { trabajador: usuarioActual } = useAuth();
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aEliminar, setAEliminar] = useState<Trabajador | null>(null);

  const cargar = async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("trabajadores")
      .select("*")
      .order("activo", { ascending: false })
      .order("nombre");
    if (error) setError(error.message);
    else setTrabajadores((data as Trabajador[]) ?? []);
    setCargando(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  const toggleActivo = async (t: Trabajador) => {
    const { error } = await supabase
      .from("trabajadores")
      .update({ activo: !t.activo })
      .eq("id", t.id);
    if (error) {
      alert(`Error: ${error.message}`);
      return;
    }
    cargar();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <Link to="/admin" className="text-xs text-slate-500 hover:text-slate-900">
              ← Panel admin
            </Link>
            <p className="text-base font-semibold text-slate-900">Trabajadores</p>
          </div>
          <Link to="/admin/trabajadores/nuevo" className="btn-primary py-2 px-4 text-sm">
            + Nuevo
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-3">
        {error && (
          <div className="card border-l-4 border-red-500 bg-red-50 text-sm text-red-700">
            {error}
          </div>
        )}

        {cargando && <p className="text-sm text-slate-500">Cargando…</p>}

        {!cargando && trabajadores.length === 0 && (
          <div className="card text-center text-sm text-slate-500">
            Todavía no hay trabajadores.{" "}
            <Link to="/admin/trabajadores/nuevo" className="text-marca-600 underline">
              Da de alta el primero
            </Link>
            .
          </div>
        )}

        {trabajadores.map((t) => {
          const esYoMismo = usuarioActual?.id === t.id;
          return (
            <div
              key={t.id}
              className={`card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${
                !t.activo ? "opacity-60" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-base font-semibold text-slate-900">
                    {t.nombre}
                  </p>
                  {t.es_admin && (
                    <span className="rounded-full bg-marca-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-marca-700 ring-1 ring-marca-500/20">
                      Admin
                    </span>
                  )}
                  {!t.activo && (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      Inactivo
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  @{t.usuario} · {pesos(Number(t.tarifa_hora))}/hora
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <Link
                  to={`/admin/trabajadores/${t.id}`}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Editar
                </Link>
                <button
                  onClick={() => toggleActivo(t)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {t.activo ? "Desactivar" : "Activar"}
                </button>
                <button
                  onClick={() => setAEliminar(t)}
                  disabled={esYoMismo}
                  title={esYoMismo ? "No puedes eliminarte a ti mismo" : "Eliminar permanentemente"}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Eliminar
                </button>
              </div>
            </div>
          );
        })}
      </main>

      {aEliminar && (
        <ConfirmarEliminarTrabajador
          trabajador={aEliminar}
          onCancelar={() => setAEliminar(null)}
          onEliminado={() => {
            setAEliminar(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}
