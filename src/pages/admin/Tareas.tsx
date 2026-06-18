import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  supabase,
  type Trabajador,
  type Tarea,
} from "../../lib/supabase";
import { DIAS_SEMANA } from "../../lib/dias";
import { fechaHoyMx } from "../../lib/marcado";
import {
  cargarTareasActivasTodos,
  cargarCompletadasTodos,
  diariaAplica,
  semanalAplica,
  semanaDe,
  lunesDe,
  sumarDias,
} from "../../lib/planner";

// Tipo de tarea: por dia o por semana.
type Tipo = "dia" | "semana";
// Modo de asignacion: recurrente o de una sola vez.
type Modo = "repetir" | "una_vez";
// Submodo de las diarias recurrentes.
type SubDia = "todos" | "especificos";

// --- Formato de fechas (las cadenas "YYYY-MM-DD" se tratan como UTC mediodia) ---
const parse = (f: string) => new Date(f + "T12:00:00Z");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (f: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", ...opts }).format(parse(f));

/** Texto corto con los dias en que aplica una tarea (ej. "Lun, Mie, Vie"). */
function textoDias(dias: number[] | null): string {
  if (!dias || dias.length === 0) return "";
  return DIAS_SEMANA.filter((d) => dias.includes(d.numero))
    .map((d) => d.corto)
    .join(", ");
}

/** Rango "15 jun – 21 jun" de la semana que contiene `fecha`. */
function rangoSemana(fecha: string): string {
  const dias = semanaDe(fecha);
  return `${fmt(dias[0], { day: "numeric", month: "short" })} – ${fmt(dias[6], { day: "numeric", month: "short" })}`;
}

/** Descripcion legible de cuando aplica una tarea. */
function descripcionRecurrencia(t: Tarea): string {
  if (t.frecuencia === "semanal") {
    if (t.fecha) return `Solo la semana del ${rangoSemana(t.fecha)}`;
    return "Cada semana";
  }
  if (t.fecha) {
    return `Una vez · ${cap(fmt(t.fecha, { weekday: "short", day: "numeric", month: "short" }))}`;
  }
  if (t.dias_semana && t.dias_semana.length > 0) return textoDias(t.dias_semana);
  return "Todos los dias";
}

export default function AdminTareas() {
  const hoy = fechaHoyMx();

  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [seleccionado, setSeleccionado] = useState<string>("");
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // Token que se incrementa tras cada cambio para refrescar el calendario.
  const [recargar, setRecargar] = useState(0);

  // --- Formulario de nueva tarea ---
  const [nuevoTitulo, setNuevoTitulo] = useState("");
  const [tipo, setTipo] = useState<Tipo>("dia");
  const [modo, setModo] = useState<Modo>("repetir");
  const [subDia, setSubDia] = useState<SubDia>("todos");
  const [nuevosDias, setNuevosDias] = useState<number[]>([]);
  const [fechaUna, setFechaUna] = useState<string>(hoy);
  const [editandoId, setEditandoId] = useState<string | null>(null);

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

  // Validacion del formulario segun el modo elegido.
  const formInvalido =
    !nuevoTitulo.trim() ||
    (tipo === "dia" &&
      modo === "repetir" &&
      subDia === "especificos" &&
      nuevosDias.length === 0) ||
    (modo === "una_vez" && !fechaUna);

  const limpiarForm = () => {
    setNuevoTitulo("");
    setNuevosDias([]);
    setTipo("dia");
    setModo("repetir");
    setSubDia("todos");
    setFechaUna(hoy);
    setEditandoId(null);
  };

  const iniciarEdicion = (t: Tarea) => {
    setEditandoId(t.id);
    setNuevoTitulo(t.titulo);
    setTipo(t.frecuencia === "semanal" ? "semana" : "dia");
    setModo(t.fecha ? "una_vez" : "repetir");
    setSubDia(t.dias_semana && t.dias_semana.length > 0 ? "especificos" : "todos");
    setNuevosDias(t.dias_semana ?? []);
    setFechaUna(t.fecha ?? hoy);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelarEdicion = () => limpiarForm();

  const guardar = async () => {
    if (!seleccionado || formInvalido) return;
    setGuardando(true);

    const frecuencia = tipo === "semana" ? "semanal" : "diaria";
    const fecha = modo === "una_vez" ? fechaUna : null;
    const dias_semana =
      tipo === "dia" && modo === "repetir" && subDia === "especificos"
        ? [...nuevosDias].sort()
        : null;

    if (editandoId) {
      await supabase
        .from("tareas")
        .update({ titulo: nuevoTitulo.trim(), frecuencia, fecha, dias_semana })
        .eq("id", editandoId);
    } else {
      await supabase.from("tareas").insert({
        trabajador_id: seleccionado,
        titulo: nuevoTitulo.trim(),
        frecuencia,
        fecha,
        dias_semana,
        orden: tareas.length,
      });
    }

    limpiarForm();
    await cargarTareas();
    setRecargar((n) => n + 1);
    setGuardando(false);
  };

  const alternarActivo = async (t: Tarea) => {
    setGuardando(true);
    await supabase.from("tareas").update({ activo: !t.activo }).eq("id", t.id);
    await cargarTareas();
    setRecargar((n) => n + 1);
    setGuardando(false);
  };

  const eliminar = async (t: Tarea) => {
    setGuardando(true);
    await supabase.from("tareas").delete().eq("id", t.id);
    await cargarTareas();
    setRecargar((n) => n + 1);
    setGuardando(false);
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-navy-700">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
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
          <p className="text-sm font-semibold text-white">Tareas</p>
          <span className="w-14" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {/* ===== Calendario de todos (siempre visible) ===== */}
        <section className="space-y-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Calendario de todos
          </p>
          <MatrizTodos trabajadores={trabajadores} recargar={recargar} />
        </section>

        {/* ===== Gestionar tareas de un trabajador ===== */}
        <section className="space-y-4 border-t border-slate-200 pt-5">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Asignar tareas
          </p>

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

          {/* Nueva tarea */}
          <div className="card space-y-4">
            <p className="label-section">{editandoId ? "Editar tarea" : "Nueva tarea"}</p>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Descripcion
              </label>
              <input
                className="input-field"
                value={nuevoTitulo}
                onChange={(e) => setNuevoTitulo(e.target.value)}
                placeholder="Ej. Limpiar mostrador"
              />
            </div>

            {/* Tipo: dia o semana */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">
                Asignar por
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Segmento activo={tipo === "dia"} onClick={() => setTipo("dia")}>
                  Dia
                </Segmento>
                <Segmento activo={tipo === "semana"} onClick={() => setTipo("semana")}>
                  Semana
                </Segmento>
              </div>
            </div>

            {/* Modo: repetir o una vez */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">
                Repeticion
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Segmento activo={modo === "repetir"} onClick={() => setModo("repetir")}>
                  {tipo === "semana" ? "Cada semana" : "Repetir"}
                </Segmento>
                <Segmento activo={modo === "una_vez"} onClick={() => setModo("una_vez")}>
                  Una vez
                </Segmento>
              </div>
            </div>

            {/* Detalle segun tipo + modo */}
            {tipo === "dia" && modo === "repetir" && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Segmento
                    activo={subDia === "todos"}
                    onClick={() => setSubDia("todos")}
                    small
                  >
                    Todos los dias
                  </Segmento>
                  <Segmento
                    activo={subDia === "especificos"}
                    onClick={() => setSubDia("especificos")}
                    small
                  >
                    Dias especificos
                  </Segmento>
                </div>
                {subDia === "especificos" && (
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
                )}
              </div>
            )}

            {tipo === "dia" && modo === "una_vez" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Que dia
                </label>
                <input
                  type="date"
                  value={fechaUna}
                  onChange={(e) => setFechaUna(e.target.value)}
                  className="input-field"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Solo aparece ese dia, no se repite.
                </p>
              </div>
            )}

            {tipo === "semana" && modo === "una_vez" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Que semana
                </label>
                <input
                  type="date"
                  value={fechaUna}
                  onChange={(e) => setFechaUna(e.target.value)}
                  className="input-field"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Semana del {rangoSemana(fechaUna)}. Se puede hacer cualquier dia de esa semana.
                </p>
              </div>
            )}

            {tipo === "semana" && modo === "repetir" && (
              <p className="text-[11px] text-slate-400">
                Se repite cada semana. El trabajador puede hacerla cualquier dia.
              </p>
            )}

            <div className="flex gap-2">
              {editandoId && (
                <button
                  type="button"
                  onClick={cancelarEdicion}
                  disabled={guardando}
                  className="btn-secondary flex-1 py-2.5 text-sm"
                >
                  Cancelar
                </button>
              )}
              <button
                onClick={() => void guardar()}
                disabled={guardando || formInvalido}
                className="btn-primary flex-1 py-2.5 text-sm"
              >
                {editandoId ? "Guardar cambios" : "Agregar tarea"}
              </button>
            </div>
          </div>

          {/* Lista de tareas del trabajador */}
          {cargando && <p className="text-center text-sm text-slate-400">Cargando...</p>}

          {!cargando && tareas.length === 0 && (
            <div className="card text-center text-sm text-slate-500">
              Este trabajador todavia no tiene tareas. Agrega la primera arriba.
            </div>
          )}

          {tareas.length > 0 && (
            <div className="space-y-2">
              <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Tareas de {trabajadores.find((w) => w.id === seleccionado)?.nombre ?? ""}
              </p>
              {tareas.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-center gap-3 rounded-lg bg-white p-3 ring-1 ${
                    editandoId === t.id ? "ring-navy-400" : "ring-slate-200"
                  } ${t.activo ? "" : "opacity-50"}`}
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{t.titulo}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-marca-600">
                      {descripcionRecurrencia(t)}
                    </p>
                  </div>
                  <button
                    onClick={() => iniciarEdicion(t)}
                    disabled={guardando}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 ring-1 ring-slate-200 transition hover:ring-navy-400 hover:text-navy-700"
                    title="Editar tarea"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => void alternarActivo(t)}
                    disabled={guardando}
                    className="rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200 transition hover:ring-navy-400 hover:text-navy-700"
                    title={t.activo ? "Ocultar tarea" : "Activar tarea"}
                  >
                    {t.activo ? "Activa" : "Oculta"}
                  </button>
                  <button
                    onClick={() => void eliminar(t)}
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
          )}
        </section>
      </main>
    </div>
  );
}

/** Boton de segmento reutilizable. */
function Segmento({
  activo,
  onClick,
  children,
  small,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border font-semibold transition ${
        small ? "py-2 text-xs" : "py-2.5 text-sm"
      } ${
        activo
          ? "border-navy-400 bg-navy-50 text-navy-700"
          : "border-slate-200 bg-white text-slate-500"
      }`}
    >
      {children}
    </button>
  );
}

// ============================================================
//  CALENDARIO DE TODOS LOS TRABAJADORES (semana)
// ============================================================

function MatrizTodos({
  trabajadores,
  recargar,
}: {
  trabajadores: Trabajador[];
  recargar: number;
}) {
  const hoy = fechaHoyMx();
  const [cursor, setCursor] = useState<string>(hoy);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [hechas, setHechas] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(false);

  const dias = semanaDe(cursor);

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      setCargando(true);
      const todas = await cargarTareasActivasTodos();
      const periodos = [...dias, ...dias.map(lunesDe)];
      const set = await cargarCompletadasTodos(periodos);
      if (!cancelado) {
        setTareas(todas);
        setHechas(set);
        setCargando(false);
      }
    };
    void cargar();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, recargar]);

  const tareasDe = (id: string) => tareas.filter((t) => t.trabajador_id === id);
  const semanaLabel = rangoSemana(cursor);

  return (
    <div className="space-y-3">
      {/* Navegacion de semana */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor(sumarDias(cursor, -7))}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200 transition hover:ring-navy-400 hover:text-navy-700"
          aria-label="Semana anterior"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <div className="flex flex-col items-center">
          <p className="text-sm font-semibold text-slate-800">{semanaLabel}</p>
          <button
            type="button"
            onClick={() => setCursor(hoy)}
            className="text-[11px] font-semibold text-marca-600 hover:underline"
          >
            Hoy
          </button>
        </div>
        <button
          type="button"
          onClick={() => setCursor(sumarDias(cursor, 7))}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200 transition hover:ring-navy-400 hover:text-navy-700"
          aria-label="Semana siguiente"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>

      {cargando && <p className="text-center text-xs text-slate-400">Cargando...</p>}

      {trabajadores.length === 0 ? (
        <div className="card text-center text-sm text-slate-500">
          No hay trabajadores activos.
        </div>
      ) : (
        <div className="card overflow-x-auto p-2">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left font-semibold text-slate-400">
                  Trabajador
                </th>
                {dias.map((f) => (
                  <th
                    key={f}
                    className={`px-1 py-1 text-center font-semibold ${
                      f === hoy ? "text-navy-700" : "text-slate-400"
                    }`}
                  >
                    <div>{cap(fmt(f, { weekday: "short" }))}</div>
                    <div className="text-[10px] font-normal">{fmt(f, { day: "numeric" })}</div>
                  </th>
                ))}
                <th className="px-1 py-1 text-center font-semibold text-slate-400">Sem</th>
              </tr>
            </thead>
            <tbody>
              {trabajadores.map((w) => {
                const mias = tareasDe(w.id);
                const sem = mias.filter((t) => semanalAplica(t, cursor));
                const semItems = sem.map((t) => ({
                  titulo: t.titulo,
                  hecha: hechas.has(`${t.id}|${lunesDe(cursor)}`),
                }));
                return (
                  <tr key={w.id} className="border-t border-slate-100">
                    <td className="sticky left-0 z-10 bg-white px-2 py-1.5 align-top font-medium text-slate-700">
                      <span className="block max-w-[96px] truncate">{w.nombre}</span>
                    </td>
                    {dias.map((f) => {
                      const items = mias
                        .filter((t) => diariaAplica(t, f))
                        .map((t) => ({
                          titulo: t.titulo,
                          hecha: hechas.has(`${t.id}|${f}`),
                        }));
                      return (
                        <td
                          key={f}
                          className={`min-w-[130px] px-1 py-1.5 align-top ${f === hoy ? "bg-navy-50/60" : ""}`}
                        >
                          <CeldaTareas items={items} />
                        </td>
                      );
                    })}
                    <td className="min-w-[130px] px-1 py-1.5 align-top">
                      <CeldaTareas items={semItems} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-center text-[11px] text-slate-400">
        Cada celda lista las tareas del dia; tachada = hecha. "Sem" = tareas de la semana.
      </p>
    </div>
  );
}

/** Celda que lista las tareas del dia (titulo primero, check al lado). */
function CeldaTareas({ items }: { items: { titulo: string; hecha: boolean }[] }) {
  if (items.length === 0) return <span className="text-slate-300">—</span>;
  return (
    <div className="space-y-1">
      {items.map((it, i) => (
        <div
          key={i}
          className={`flex items-start justify-between gap-1 rounded px-1 py-0.5 ${
            it.hecha ? "bg-emerald-50" : "bg-slate-50"
          }`}
        >
          <span
            className={`text-[10px] leading-tight ${
              it.hecha ? "text-slate-400 line-through" : "text-slate-700"
            }`}
          >
            {it.titulo}
          </span>
          <span
            className={`mt-[1px] flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border ${
              it.hecha
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-slate-300 bg-white"
            }`}
          >
            {it.hecha && (
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
