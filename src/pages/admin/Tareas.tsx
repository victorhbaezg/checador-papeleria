import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  supabase,
  type Trabajador,
  type Tarea,
} from "../../lib/supabase";
import { DIAS_SEMANA } from "../../lib/dias";

// Modo de repeticion al crear la tarea.
type ModoTarea = "diaria" | "dias" | "semanal";

/** Texto corto con los dias en que aplica una tarea (ej. "Lun, Mie, Vie"). */
function textoDias(dias: number[] | null): string {
  if (!dias || dias.length === 0) return "";
  return DIAS_SEMANA.filter((d) => dias.includes(d.numero))
    .map((d) => d.corto)
    .join(", ");
}

export default function AdminTareas() {
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [seleccionado, setSeleccionado] = useState<string>("");
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [nuevoTitulo, setNuevoTitulo] = useState("");
  const [nuevoModo, setNuevoModo] = useState<ModoTarea>("diaria");
  const [nuevosDias, setNuevosDias] = useState<number[]>([]);

  useEffect(() => {
    void cargarTrabajadores();
  }, []);

  useEffect(() => {
    if (seleccionado) void cargarTareas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionado]);

  const cargarTrabajadores = async () => {
    const { data } = await supabase
      .from("trabajadores")
      .select("*")
      .eq("activo", true)
      .order("nombre", { ascending: true });
    const lista = (data ?? []) as Trabajador[];
    setTrabajadores(lista);
    if (lista.length > 0) setSeleccionado(lista[0].id);
  };

  const cargarTareas = async () => {
    setCargando(true);
    const { data } = await supabase
      .from("tareas")
      .select("*")
      .eq("trabajador_id", seleccionado)
      .order("frecuencia", { ascending: true })
      .order("orden", { ascending: true })
      .order("creado_en", { ascending: true });
    setTareas((data ?? []) as Tarea[]);
    setCargando(false);
  };

  const toggleDia = (numero: number) => {
    setNuevosDias((prev) =>
      prev.includes(numero) ? prev.filter((d) => d !== numero) : [...prev, numero],
    );
  };

  const agregar = async () => {
    if (!seleccionado || !nuevoTitulo.trim()) return;
    if (nuevoModo === "dias" && nuevosDias.length === 0) return;
    setGuardando(true);
    await supabase.from("tareas").insert({
      trabajador_id: seleccionado,
      titulo: nuevoTitulo.trim(),
      frecuencia: nuevoModo === "semanal" ? "semanal" : "diaria",
      dias_semana: nuevoModo === "dias" ? [...nuevosDias].sort() : null,
      orden: tareas.length,
    });
    setNuevoTitulo("");
    setNuevoModo("diaria");
    setNuevosDias([]);
    await cargarTareas();
    setGuardando(false);
  };

  const alternarActivo = async (t: Tarea) => {
    setGuardando(true);
    await supabase.from("tareas").update({ activo: !t.activo }).eq("id", t.id);
    await cargarTareas();
    setGuardando(false);
  };

  const eliminar = async (t: Tarea) => {
    setGuardando(true);
    await supabase.from("tareas").delete().eq("id", t.id);
    await cargarTareas();
    setGuardando(false);
  };

  const todosDias = tareas.filter(
    (t) => t.frecuencia === "diaria" && (!t.dias_semana || t.dias_semana.length === 0),
  );
  const diasEspecificos = tareas.filter(
    (t) => t.frecuencia === "diaria" && t.dias_semana && t.dias_semana.length > 0,
  );
  const semanales = tareas.filter((t) => t.frecuencia === "semanal");

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
          <p className="text-sm font-semibold text-white">Tareas por trabajador</p>
          <span className="w-14" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        {/* Selector de trabajador */}
        <div className="card">
          <label className="label-section">Trabajador</label>
          <select
            value={seleccionado}
            onChange={(e) => setSeleccionado(e.target.value)}
            className="input-field mt-2 w-full"
          >
            {trabajadores.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </div>

        {/* Agregar tarea */}
        <div className="card space-y-3">
          <p className="label-section">Nueva tarea</p>
          <input
            className="input-field"
            value={nuevoTitulo}
            onChange={(e) => setNuevoTitulo(e.target.value)}
            placeholder="Ej. Limpiar mostrador"
          />
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setNuevoModo("diaria")}
              className={`rounded-lg border py-2 text-xs font-semibold transition ${
                nuevoModo === "diaria"
                  ? "border-navy-400 bg-navy-50 text-navy-700"
                  : "border-slate-200 bg-white text-slate-500"
              }`}
            >
              Todos los dias
            </button>
            <button
              type="button"
              onClick={() => setNuevoModo("dias")}
              className={`rounded-lg border py-2 text-xs font-semibold transition ${
                nuevoModo === "dias"
                  ? "border-navy-400 bg-navy-50 text-navy-700"
                  : "border-slate-200 bg-white text-slate-500"
              }`}
            >
              Dias especificos
            </button>
            <button
              type="button"
              onClick={() => setNuevoModo("semanal")}
              className={`rounded-lg border py-2 text-xs font-semibold transition ${
                nuevoModo === "semanal"
                  ? "border-navy-400 bg-navy-50 text-navy-700"
                  : "border-slate-200 bg-white text-slate-500"
              }`}
            >
              Cada semana
            </button>
          </div>

          {/* Selector de dias para "Dias especificos" */}
          {nuevoModo === "dias" && (
            <div>
              <p className="mb-1.5 text-xs text-slate-500">
                Elige en que dias aparece esta tarea:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {DIAS_SEMANA.map((d) => {
                  const activo = nuevosDias.includes(d.numero);
                  return (
                    <button
                      key={d.numero}
                      type="button"
                      onClick={() => toggleDia(d.numero)}
                      className={`h-9 w-11 rounded-lg border text-xs font-semibold transition ${
                        activo
                          ? "border-marca-500 bg-marca-500 text-white"
                          : "border-slate-200 bg-white text-slate-500"
                      }`}
                    >
                      {d.corto}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            onClick={() => void agregar()}
            disabled={
              guardando ||
              !nuevoTitulo.trim() ||
              (nuevoModo === "dias" && nuevosDias.length === 0)
            }
            className="btn-primary w-full py-2.5 text-sm"
          >
            Agregar tarea
          </button>
        </div>

        {cargando && <p className="text-center text-sm text-slate-400">Cargando...</p>}

        {!cargando && tareas.length === 0 && (
          <div className="card text-center text-sm text-slate-500">
            Este trabajador todavia no tiene tareas. Agrega la primera arriba.
          </div>
        )}

        {todosDias.length > 0 && (
          <ListaTareas
            titulo="Todos los dias"
            tareas={todosDias}
            guardando={guardando}
            onAlternarActivo={alternarActivo}
            onEliminar={eliminar}
          />
        )}
        {diasEspecificos.length > 0 && (
          <ListaTareas
            titulo="Dias especificos"
            tareas={diasEspecificos}
            guardando={guardando}
            onAlternarActivo={alternarActivo}
            onEliminar={eliminar}
          />
        )}
        {semanales.length > 0 && (
          <ListaTareas
            titulo="Cada semana"
            tareas={semanales}
            guardando={guardando}
            onAlternarActivo={alternarActivo}
            onEliminar={eliminar}
          />
        )}
      </main>
    </div>
  );
}

function ListaTareas({
  titulo,
  tareas,
  guardando,
  onAlternarActivo,
  onEliminar,
}: {
  titulo: string;
  tareas: Tarea[];
  guardando: boolean;
  onAlternarActivo: (t: Tarea) => void;
  onEliminar: (t: Tarea) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {titulo}
      </p>
      {tareas.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-3 rounded-lg bg-white p-3 ring-1 ring-slate-200 ${
            t.activo ? "" : "opacity-50"
          }`}
        >
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-800">{t.titulo}</p>
            {t.dias_semana && t.dias_semana.length > 0 && (
              <p className="mt-0.5 text-[11px] font-medium text-marca-600">
                {textoDias(t.dias_semana)}
              </p>
            )}
          </div>
          <button
            onClick={() => onAlternarActivo(t)}
            disabled={guardando}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200 transition hover:ring-navy-400 hover:text-navy-700"
            title={t.activo ? "Ocultar tarea" : "Activar tarea"}
          >
            {t.activo ? "Activa" : "Oculta"}
          </button>
          <button
            onClick={() => onEliminar(t)}
            disabled={guardando}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 ring-1 ring-slate-200 transition hover:ring-rose-400 hover:text-rose-600"
            title="Eliminar tarea"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
