import { useEffect, useState } from "react";
import { supabase, type Trabajador } from "../lib/supabase";

type Props = {
  trabajador: Trabajador;
  onCancelar: () => void;
  onEliminado: () => void;
};

/**
 * Modal de confirmación destructiva.
 * Pide al admin escribir el nombre exacto del trabajador para evitar borrados accidentales.
 */
export default function ConfirmarEliminarTrabajador({
  trabajador,
  onCancelar,
  onEliminado,
}: Props) {
  const [texto, setTexto] = useState("");
  const [marcas, setMarcas] = useState<number | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Contar marcas existentes para mostrar el daño potencial
  useEffect(() => {
    const cargar = async () => {
      const { count, error } = await supabase
        .from("marcas")
        .select("*", { count: "exact", head: true })
        .eq("trabajador_id", trabajador.id);
      if (!error) setMarcas(count ?? 0);
    };
    cargar();
  }, [trabajador.id]);

  // Cerrar con tecla Esc
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !eliminando) onCancelar();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancelar, eliminando]);

  const coincide = texto.trim() === trabajador.nombre.trim();

  const eliminar = async () => {
    if (!coincide) return;
    setEliminando(true);
    setError(null);
    try {
      const { data, error: errFn } = await supabase.functions.invoke(
        "eliminar-trabajador",
        { body: { trabajador_id: trabajador.id } },
      );
      if (errFn) {
        const ctx = (errFn as { context?: Response }).context;
        let msg = errFn.message;
        if (ctx) {
          try {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          } catch {
            /* ignorar */
          }
        }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      onEliminado();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEliminando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 px-4 py-4 sm:items-center"
      onClick={() => !eliminando && onCancelar()}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-xl">
            ⚠️
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Eliminar permanentemente
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Vas a eliminar a <strong>{trabajador.nombre}</strong> (@{trabajador.usuario}).
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">Esta acción no se puede deshacer.</p>
          <p className="mt-1">
            Se perderá su acceso a la app
            {marcas !== null && marcas > 0 && (
              <> y se borrarán <strong>{marcas}</strong> marcas históricas (asistencias, retardos, faltas)</>
            )}
            {marcas === 0 && <> (todavía no tiene marcas registradas)</>}.
          </p>
          {marcas !== null && marcas > 0 && (
            <p className="mt-2 text-xs">
              Si solo quieres que deje de aparecer en el marcado, usa{" "}
              <strong>Desactivar</strong> en lugar de eliminar.
            </p>
          )}
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Para confirmar, escribe el nombre exacto:{" "}
            <span className="font-mono text-slate-900">{trabajador.nombre}</span>
          </label>
          <input
            className="input-field"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={trabajador.nombre}
            disabled={eliminando}
            autoFocus
          />
        </div>

        {error && (
          <div className="mt-3 rounded-lg border-l-4 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancelar}
            disabled={eliminando}
            className="btn-secondary py-2 px-4 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={eliminar}
            disabled={!coincide || eliminando}
            className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {eliminando ? "Eliminando…" : "Eliminar permanentemente"}
          </button>
        </div>
      </div>
    </div>
  );
}
