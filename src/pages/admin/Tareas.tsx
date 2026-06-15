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
  cargarCompletadas,
  cargarTareasActivasTodos,
  cargarCompletadasTodos,
  diariaAplica,
  periodoDe,
  semanaDe,
  lunesDe,
  sumarDias,
  sumarMeses,
  inicioMes,
  diasEnMes,
  diaSemanaDe,
} from "../../lib/planner";

// Modo de repeticion al crear la tarea.
type ModoTarea = "diaria" | "dias" | "semanal";
// Pestana principal de la pantalla.
type Vista = "lista" | "calendario" | "todos";
// Granularidad del calendario.
type ModoCal = "dia" | "semana" | "mes";

/** Texto corto con los dias en que aplica una tarea (ej. "Lun, Mie, Vie"). */
function textoDias(dias: number[] | null): string {
  if (!dias || dias.length === 0) return "";
  return DIAS_SEMANA.filter((d) => dias.includes(d.numero))
    .map((d) => d.corto)
    .join(", ");
}

// --- Formato de fechas (las cadenas "YYYY-MM-DD" se tratan como UTC mediodia) ---
const parse = (f: string) => new Date(f + "T12:00:00Z");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (f: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", ...opts }).format(parse(f));

export default function AdminTareas() {
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [seleccionado, setSeleccionado] = useState<string>("");
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [vista, setVista] = useState<Vista>("lista");

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

        {/* Pestanas Lista / Calendario / Todos */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setVista("lista")}
            className={`rounded-lg border py-2.5 text-sm font-semibold transition ${
              vista === "lista"
                ? "border-navy-400 bg-navy-50 text-navy-700"
                : "border-slate-200 bg-white text-slate-500"
            }`}
          >
            Lista
          </button>
          <button
            type="button"
            onClick={() => setVista("calendario")}
            className={`rounded-lg border py-2.5 text-sm font-semibold transition ${
              vista === "calendario"
                ? "border-navy-400 bg-navy-50 text-navy-700"
                : "border-slate-200 bg-white text-slate-500"
            }`}
          >
            Calendario
          </button>
          <button
            type="button"
            onClick={() => setVista("todos")}
            className={`rounded-lg border py-2.5 text-sm font-semibold transition ${
              vista === "todos"
                ? "border-navy-400 bg-navy-50 text-navy-700"
                : "border-slate-200 bg-white text-slate-500"
            }`}
          >
            Todos
          </button>
        </div>

        {vista === "calendario" ? (
          <Planner trabajadorId={seleccionado} tareas={tareas.filter((t) => t.activo)} />
        ) : vista === "todos" ? (
          <MatrizTodos trabajadores={trabajadores} />
        ) : (
          <>
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
          </>
        )}
      </main>
    </div>
  );
}

// ============================================================
//  PLANNER / CALENDARIO
// ============================================================

function Planner({
  trabajadorId,
  tareas,
}: {
  trabajadorId: string;
  tareas: Tarea[];
}) {
  const hoy = fechaHoyMx();
  const [modo, setModo] = useState<ModoCal>("semana");
  const [cursor, setCursor] = useState<string>(hoy);
  const [hechas, setHechas] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(false);

  const diarias = tareas.filter((t) => t.frecuencia === "diaria");
  const semanales = tareas.filter((t) => t.frecuencia === "semanal");

  // Dias visibles segun el modo.
  const diasVisibles = (): string[] => {
    if (modo === "dia") return [cursor];
    if (modo === "semana") return semanaDe(cursor);
    const ini = inicioMes(cursor);
    return Array.from({ length: diasEnMes(cursor) }, (_, i) => sumarDias(ini, i));
  };

  useEffect(() => {
    if (!trabajadorId) return;
    let cancelado = false;
    const cargar = async () => {
      setCargando(true);
      const dias = diasVisibles();
      const periodos = [...dias, ...dias.map(lunesDe)];
      const set = await cargarCompletadas(trabajadorId, periodos);
      if (!cancelado) {
        setHechas(set);
        setCargando(false);
      }
    };
    void cargar();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trabajadorId, modo, cursor, tareas]);

  const estaHecha = (t: Tarea, fecha: string) =>
    hechas.has(`${t.id}|${periodoDe(t, fecha)}`);

  const navegar = (dir: number) => {
    if (modo === "dia") setCursor(sumarDias(cursor, dir));
    else if (modo === "semana") setCursor(sumarDias(cursor, dir * 7));
    else setCursor(sumarMeses(cursor, dir));
  };

  const etiqueta = (): string => {
    if (modo === "dia") return cap(fmt(cursor, { weekday: "long", day: "numeric", month: "long" }));
    if (modo === "semana") {
      const dias = semanaDe(cursor);
      const a = fmt(dias[0], { day: "numeric", month: "short" });
      const b = fmt(dias[6], { day: "numeric", month: "short" });
      return `${a} – ${b}`;
    }
    return cap(fmt(cursor, { month: "long", year: "numeric" }));
  };

  return (
    <div className="space-y-3">
      {/* Selector de granularidad */}
      <div className="grid grid-cols-3 gap-2">
        {(["dia", "semana", "mes"] as ModoCal[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            className={`rounded-lg border py-2 text-xs font-semibold capitalize transition ${
              modo === m
                ? "border-navy-400 bg-navy-50 text-navy-700"
                : "border-slate-200 bg-white text-slate-500"
            }`}
          >
            {m === "dia" ? "Dia" : m === "semana" ? "Semana" : "Mes"}
          </button>
        ))}
      </div>

      {/* Navegacion */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navegar(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200 transition hover:ring-navy-400 hover:text-navy-700"
          aria-label="Anterior"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <div className="flex flex-col items-center">
          <p className="text-sm font-semibold text-slate-800">{etiqueta()}</p>
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
          onClick={() => navegar(1)}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200 transition hover:ring-navy-400 hover:text-navy-700"
          aria-label="Siguiente"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>

      {cargando && <p className="text-center text-xs text-slate-400">Cargando...</p>}

      {tareas.length === 0 ? (
        <div className="card text-center text-sm text-slate-500">
          Este trabajador no tiene tareas activas que mostrar.
        </div>
      ) : modo === "dia" ? (
        <VistaDia
          fecha={cursor}
          hoy={hoy}
          diarias={diarias}
          semanales={semanales}
          estaHecha={estaHecha}
        />
      ) : modo === "semana" ? (
        <VistaSemana
          fecha={cursor}
          hoy={hoy}
          diarias={diarias}
          semanales={semanales}
          estaHecha={estaHecha}
          onElegirDia={(f) => {
            setCursor(f);
            setModo("dia");
          }}
        />
      ) : (
        <VistaMes
          fecha={cursor}
          hoy={hoy}
          diarias={diarias}
          estaHecha={estaHecha}
          onElegirDia={(f) => {
            setCursor(f);
            setModo("dia");
          }}
        />
      )}
    </div>
  );
}

// --- Una fila de tarea de solo lectura (con check) ---
function FilaPlanner({ titulo, hecha }: { titulo: string; hecha: boolean }) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 ring-1 ${
        hecha ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-slate-200"
      }`}
    >
      <span
        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 ${
          hecha ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white"
        }`}
      >
        {hecha && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        )}
      </span>
      <span className={`text-sm ${hecha ? "text-slate-400 line-through" : "text-slate-800"}`}>
        {titulo}
      </span>
    </div>
  );
}

// --- Bloque de tareas semanales (compartido por dia y semana) ---
function BloqueSemanales({
  fecha,
  semanales,
  estaHecha,
}: {
  fecha: string;
  semanales: Tarea[];
  estaHecha: (t: Tarea, fecha: string) => boolean;
}) {
  if (semanales.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Tareas de la semana
      </p>
      {semanales.map((t) => (
        <FilaPlanner key={t.id} titulo={t.titulo} hecha={estaHecha(t, fecha)} />
      ))}
    </div>
  );
}

function VistaDia({
  fecha,
  hoy,
  diarias,
  semanales,
  estaHecha,
}: {
  fecha: string;
  hoy: string;
  diarias: Tarea[];
  semanales: Tarea[];
  estaHecha: (t: Tarea, fecha: string) => boolean;
}) {
  const delDia = diarias.filter((t) => diariaAplica(t, fecha));
  const hechasDia = delDia.filter((t) => estaHecha(t, fecha)).length;
  return (
    <div className="space-y-3">
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="label-section">
            {fecha === hoy ? "Hoy" : "Tareas del dia"}
          </p>
          {delDia.length > 0 && (
            <span
              className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                hechasDia === delDia.length
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {hechasDia}/{delDia.length}
            </span>
          )}
        </div>
        {delDia.length === 0 ? (
          <p className="text-sm text-slate-400">Sin tareas diarias este dia.</p>
        ) : (
          <div className="space-y-2">
            {delDia.map((t) => (
              <FilaPlanner key={t.id} titulo={t.titulo} hecha={estaHecha(t, fecha)} />
            ))}
          </div>
        )}
      </div>
      <BloqueSemanales fecha={fecha} semanales={semanales} estaHecha={estaHecha} />
    </div>
  );
}

function VistaSemana({
  fecha,
  hoy,
  diarias,
  semanales,
  estaHecha,
  onElegirDia,
}: {
  fecha: string;
  hoy: string;
  diarias: Tarea[];
  semanales: Tarea[];
  estaHecha: (t: Tarea, fecha: string) => boolean;
  onElegirDia: (f: string) => void;
}) {
  const dias = semanaDe(fecha);
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {dias.map((f) => {
          const delDia = diarias.filter((t) => diariaAplica(t, f));
          const hechasDia = delDia.filter((t) => estaHecha(t, f)).length;
          const esHoy = f === hoy;
          return (
            <div
              key={f}
              className={`rounded-lg bg-white p-3 ring-1 ${
                esHoy ? "ring-2 ring-navy-400" : "ring-slate-200"
              }`}
            >
              <button
                type="button"
                onClick={() => onElegirDia(f)}
                className="mb-2 flex w-full items-center justify-between"
              >
                <span className={`text-sm font-semibold ${esHoy ? "text-navy-700" : "text-slate-700"}`}>
                  {cap(fmt(f, { weekday: "long" }))} {fmt(f, { day: "numeric" })}
                </span>
                {delDia.length > 0 && (
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                      hechasDia === delDia.length
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {hechasDia}/{delDia.length}
                  </span>
                )}
              </button>
              {delDia.length === 0 ? (
                <p className="text-xs text-slate-400">Sin tareas.</p>
              ) : (
                <div className="space-y-1">
                  {delDia.map((t) => (
                    <div key={t.id} className="flex items-center gap-2">
                      <span
                        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                          estaHecha(t, f)
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-slate-300 bg-white"
                        }`}
                      >
                        {estaHecha(t, f) && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                        )}
                      </span>
                      <span className={`text-xs ${estaHecha(t, f) ? "text-slate-400 line-through" : "text-slate-700"}`}>
                        {t.titulo}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <BloqueSemanales fecha={fecha} semanales={semanales} estaHecha={estaHecha} />
    </div>
  );
}

function VistaMes({
  fecha,
  hoy,
  diarias,
  estaHecha,
  onElegirDia,
}: {
  fecha: string;
  hoy: string;
  diarias: Tarea[];
  estaHecha: (t: Tarea, fecha: string) => boolean;
  onElegirDia: (f: string) => void;
}) {
  const ini = inicioMes(fecha);
  const total = diasEnMes(fecha);
  const dias = Array.from({ length: total }, (_, i) => sumarDias(ini, i));
  // Offset: cuantas celdas vacias antes del dia 1 (lunes primero).
  const dow1 = diaSemanaDe(ini); // 0=dom..6=sab
  const offset = dow1 === 0 ? 6 : dow1 - 1;

  return (
    <div className="card space-y-2">
      <div className="grid grid-cols-7 gap-1">
        {DIAS_SEMANA.map((d) => (
          <div key={d.numero} className="py-1 text-center text-[10px] font-semibold uppercase text-slate-400">
            {d.corto}
          </div>
        ))}
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`b${i}`} />
        ))}
        {dias.map((f) => {
          const delDia = diarias.filter((t) => diariaAplica(t, f));
          const hechasDia = delDia.filter((t) => estaHecha(t, f)).length;
          const esHoy = f === hoy;
          const completo = delDia.length > 0 && hechasDia === delDia.length;
          return (
            <button
              key={f}
              type="button"
              onClick={() => onElegirDia(f)}
              className={`flex aspect-square flex-col items-center justify-center rounded-lg text-xs transition ${
                esHoy
                  ? "ring-2 ring-navy-400"
                  : "ring-1 ring-slate-100 hover:ring-navy-300"
              } ${completo ? "bg-emerald-50" : "bg-white"}`}
            >
              <span className={`font-semibold ${esHoy ? "text-navy-700" : "text-slate-700"}`}>
                {fmt(f, { day: "numeric" })}
              </span>
              {delDia.length > 0 && (
                <span
                  className={`mt-0.5 text-[9px] font-bold ${
                    completo ? "text-emerald-600" : "text-slate-400"
                  }`}
                >
                  {hechasDia}/{delDia.length}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="pt-1 text-center text-[11px] text-slate-400">
        Toca un dia para ver el detalle. Las tareas semanales se ven en Dia o Semana.
      </p>
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

// ============================================================
//  MATRIZ: TODOS LOS TRABAJADORES (vista semanal)
// ============================================================

function MatrizTodos({ trabajadores }: { trabajadores: Trabajador[] }) {
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
  }, [cursor]);

  const tareasDe = (id: string) => tareas.filter((t) => t.trabajador_id === id);
  const semanaLabel = `${fmt(dias[0], { day: "numeric", month: "short" })} – ${fmt(dias[6], { day: "numeric", month: "short" })}`;

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
                const sem = mias.filter((t) => t.frecuencia === "semanal");
                const hechasSem = sem.filter((t) =>
                  hechas.has(`${t.id}|${lunesDe(cursor)}`),
                ).length;
                return (
                  <tr key={w.id} className="border-t border-slate-100">
                    <td className="sticky left-0 z-10 bg-white px-2 py-1.5 font-medium text-slate-700">
                      <span className="block max-w-[96px] truncate">{w.nombre}</span>
                    </td>
                    {dias.map((f) => {
                      const delDia = mias.filter(
                        (t) => t.frecuencia === "diaria" && diariaAplica(t, f),
                      );
                      const h = delDia.filter((t) => hechas.has(`${t.id}|${f}`)).length;
                      return (
                        <td
                          key={f}
                          className={`px-1 py-1.5 text-center ${f === hoy ? "bg-navy-50/60" : ""}`}
                        >
                          <CeldaAvance hechas={h} total={delDia.length} />
                        </td>
                      );
                    })}
                    <td className="px-1 py-1.5 text-center">
                      <CeldaAvance hechas={hechasSem} total={sem.length} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-center text-[11px] text-slate-400">
        Verde = todo hecho, ambar = pendiente, — = sin tareas ese dia. "Sem" = tareas de cada semana.
      </p>
    </div>
  );
}

/** Celda compacta de avance hechas/total con color. */
function CeldaAvance({ hechas, total }: { hechas: number; total: number }) {
  if (total === 0) return <span className="text-slate-300">—</span>;
  const completo = hechas === total;
  return (
    <span
      className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
        completo ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
      }`}
    >
      {hechas}/{total}
    </span>
  );
}
