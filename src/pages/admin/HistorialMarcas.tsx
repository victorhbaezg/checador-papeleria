import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, type Trabajador, type Marca, type Horario, type HorarioExcepcion, type Configuracion, type TipoMarca } from "../../lib/supabase";
import {
  esRetardo,
  esRetardoPausa,
  inicioSemanaMx,
  minutosTarde,
  minutosTardePausa,
  ZONA_HORARIA,
} from "../../lib/marcado";

// ---------------------------------------------------------------------------
// Helpers de fecha/hora
// ---------------------------------------------------------------------------

function isoAFechaMx(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function isoAHoraMx(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA_HORARIA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function fechaNombreDia(fechaMx: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA_HORARIA,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(fechaMx + "T12:00:00"));
}

/** Convierte "YYYY-MM-DD" + "HH:MM" en Mexico a timestamp UTC. */
function mexicoAUTC(fechaMx: string, horaMx: string): string {
  return new Date(`${fechaMx}T${horaMx}:00-06:00`).toISOString();
}

/** Inicio (lunes UTC) de la semana con offset. 0=semana actual, -1=anterior... */
function inicioSemanaConOffset(offsetSemanas: number): Date {
  const base = new Date(Date.now() + offsetSemanas * 7 * 24 * 60 * 60 * 1000);
  return inicioSemanaMx(base);
}

/** Genera los 7 dias (lun-dom) de la semana como "YYYY-MM-DD" en MX. */
function diasDeLaSemana(inicioLunesUtc: Date): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    isoAFechaMx(new Date(inicioLunesUtc.getTime() + i * 86_400_000).toISOString()),
  );
}

function rangoTexto(inicioLunesUtc: Date): string {
  const dias = diasDeLaSemana(inicioLunesUtc);
  const inicio = new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA_HORARIA,
    day: "numeric",
    month: "short",
  }).format(new Date(dias[0] + "T12:00:00"));
  const fin = new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA_HORARIA,
    day: "numeric",
    month: "short",
  }).format(new Date(dias[6] + "T12:00:00"));
  return `${inicio} - ${fin}`;
}

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------
type FormAgregar = {
  tipo: TipoMarca;
  hora: string;
};

// Etiquetas y estilos por tipo de marca, para los chips de la lista.
const ETIQUETA_TIPO: Record<TipoMarca, string> = {
  entrada: "entrada",
  salida: "salida",
  pausa_inicio: "pausa in",
  pausa_fin: "pausa fin",
};

type EstadoEdicion = {
  marcaId: string;
  hora: string; // HH:MM actual para el input
};

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function HistorialMarcas() {
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [seleccionado, setSeleccionado] = useState<string>("");
  const [semanaOffset, setSemanaOffset] = useState(0);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [excepciones, setExcepciones] = useState<HorarioExcepcion[]>([]);
  const [tolerancia, setTolerancia] = useState(0);
  const [cargando, setCargando] = useState(false);

  // Estados de UI
  const [editando, setEditando] = useState<EstadoEdicion | null>(null);
  const [agregandoFecha, setAgregandoFecha] = useState<string | null>(null);
  const [formAgregar, setFormAgregar] = useState<FormAgregar>({ tipo: "entrada", hora: "" });
  const [guardando, setGuardando] = useState(false);

  const inicioLunesUtc = inicioSemanaConOffset(semanaOffset);
  const dias = diasDeLaSemana(inicioLunesUtc);
  const hoyMx = isoAFechaMx(new Date().toISOString());

  useEffect(() => {
    void cargarTrabajadores();
    void cargarConfig();
  }, []);

  useEffect(() => {
    if (seleccionado) {
      void cargarMarcas();
      void cargarExcepciones();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionado, semanaOffset]);

  useEffect(() => {
    if (seleccionado) void cargarHorarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionado]);

  const cargarHorarios = async () => {
    const { data } = await supabase
      .from("horarios")
      .select("*")
      .eq("trabajador_id", seleccionado);
    setHorarios((data ?? []) as Horario[]);
  };

  // Excepciones de la semana visible (pueden definir pausa propia ese dia).
  const cargarExcepciones = async () => {
    const dias = diasDeLaSemana(inicioLunesUtc);
    const { data } = await supabase
      .from("horario_excepciones")
      .select("*")
      .eq("trabajador_id", seleccionado)
      .gte("fecha", dias[0])
      .lte("fecha", dias[6]);
    setExcepciones((data ?? []) as HorarioExcepcion[]);
  };

  const cargarConfig = async () => {
    const { data } = await supabase
      .from("configuracion")
      .select("tolerancia_retardo_minutos")
      .eq("id", 1)
      .single();
    if (data) setTolerancia((data as Configuracion).tolerancia_retardo_minutos);
  };

  // Horario efectivo de una fecha: la excepcion del dia manda sobre el regular.
  const horarioEfectivoDe = (fechaMx: string): Horario | null => {
    const exc = excepciones.find((e) => e.fecha === fechaMx);
    const dia = diaSemanaDeFecha(fechaMx);
    const regular = horarios.find((x) => x.dia_semana === dia) ?? null;
    if (exc) {
      if (exc.es_dia_libre) return null;
      if (exc.hora_entrada_esperada) {
        return {
          id: "",
          trabajador_id: seleccionado,
          dia_semana: dia,
          hora_entrada_esperada: exc.hora_entrada_esperada,
          hora_salida_esperada: exc.hora_salida_esperada ?? "00:00:00",
          descansa: false,
          hora_pausa_inicio: exc.hora_pausa_inicio,
          hora_pausa_fin: exc.hora_pausa_fin,
        };
      }
    }
    return regular;
  };

  // Calcula si una marca (entrada o regreso de pausa) cuenta como retardo,
  // con la misma logica que el marcado automatico.
  const calcularRetardo = (
    fechaMx: string,
    tipo: TipoMarca,
    marcadoEnIso: string,
  ): { nota: string | null; minutos_tarde: number | null } => {
    const h = horarioEfectivoDe(fechaMx);
    const cuando = new Date(marcadoEnIso);
    let fue = false;
    let min = 0;
    if (tipo === "entrada") {
      fue = esRetardo(cuando, h, tolerancia);
      if (fue) min = minutosTarde(cuando, h);
    } else if (tipo === "pausa_fin") {
      fue = esRetardoPausa(cuando, h, tolerancia);
      if (fue) min = minutosTardePausa(cuando, h);
    }
    return { nota: fue ? "retardo" : null, minutos_tarde: fue ? min : null };
  };

  // Dia de la semana (0=domingo..6=sabado) de una fecha "YYYY-MM-DD" en MX.
  const diaSemanaDeFecha = (fechaMx: string): number => {
    const wd = new Intl.DateTimeFormat("en-US", {
      timeZone: ZONA_HORARIA,
      weekday: "short",
    }).format(new Date(fechaMx + "T12:00:00-06:00"));
    const mapa: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    return mapa[wd] ?? 0;
  };

  // Verdadero si ese dia hay pausa programada. Una excepcion de horario para
  // la fecha manda sobre el horario regular: si es dia libre no hay pausa, y
  // si es cambio de horario la pausa sale de la propia excepcion.
  const tienePausaProgramada = (fechaMx: string): boolean => {
    const exc = excepciones.find((e) => e.fecha === fechaMx);
    if (exc) {
      if (exc.es_dia_libre) return false;
      return Boolean(exc.hora_pausa_inicio && exc.hora_pausa_fin);
    }
    const dia = diaSemanaDeFecha(fechaMx);
    const h = horarios.find((x) => x.dia_semana === dia);
    return Boolean(h && h.hora_pausa_inicio && h.hora_pausa_fin);
  };

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

  const cargarMarcas = async () => {
    setCargando(true);
    const finSemanaUtc = new Date(inicioLunesUtc.getTime() + 7 * 86_400_000);
    const { data } = await supabase
      .from("marcas")
      .select("*")
      .eq("trabajador_id", seleccionado)
      .gte("marcado_en", inicioLunesUtc.toISOString())
      .lt("marcado_en", finSemanaUtc.toISOString())
      .order("marcado_en", { ascending: true });
    setMarcas((data ?? []) as Marca[]);
    setCargando(false);
  };

  // ---- Eliminar ----
  const eliminar = async (id: string) => {
    setGuardando(true);
    await supabase.from("marcas").delete().eq("id", id);
    await cargarMarcas();
    setGuardando(false);
  };

  // ---- Guardar edicion de hora ----
  const guardarEdicion = async () => {
    if (!editando) return;
    const marca = marcas.find((m) => m.id === editando.marcaId);
    if (!marca) return;
    if (!editando.hora) return;
    setGuardando(true);
    const fechaMx = isoAFechaMx(marca.marcado_en);
    const nuevoUTC = mexicoAUTC(fechaMx, editando.hora);
    const { nota, minutos_tarde } = calcularRetardo(fechaMx, marca.tipo, nuevoUTC);
    await supabase
      .from("marcas")
      .update({ marcado_en: nuevoUTC, editada_por_admin: true, nota, minutos_tarde })
      .eq("id", editando.marcaId);
    setEditando(null);
    await cargarMarcas();
    setGuardando(false);
  };

  // ---- Agregar marca manual ----
  const guardarNuevaMarca = async () => {
    if (!agregandoFecha || !formAgregar.hora) return;
    setGuardando(true);
    const marcadoEn = mexicoAUTC(agregandoFecha, formAgregar.hora);
    const { nota, minutos_tarde } = calcularRetardo(
      agregandoFecha,
      formAgregar.tipo,
      marcadoEn,
    );
    await supabase.from("marcas").insert({
      trabajador_id: seleccionado,
      tipo: formAgregar.tipo,
      marcado_en: marcadoEn,
      qr_valido: false,
      editada_por_admin: true,
      nota,
      minutos_tarde,
    });
    setAgregandoFecha(null);
    setFormAgregar({ tipo: "entrada", hora: "" });
    await cargarMarcas();
    setGuardando(false);
  };

  const cancelarAgregar = () => {
    setAgregandoFecha(null);
    setFormAgregar({ tipo: "entrada", hora: "" });
  };

  const nombreTrabajador = trabajadores.find((t) => t.id === seleccionado)?.nombre ?? "";

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
          <p className="text-sm font-semibold text-white">Historial de marcas</p>
          <span className="w-14" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">

        {/* Selector de trabajador */}
        <div className="card">
          <label className="label-section">Trabajador</label>
          <select
            value={seleccionado}
            onChange={(e) => {
              setSeleccionado(e.target.value);
              setEditando(null);
              setAgregandoFecha(null);
            }}
            className="input-field mt-2 w-full"
          >
            {trabajadores.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </div>

        {/* Navegacion de semana */}
        <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200">
          <button
            onClick={() => setSemanaOffset((o) => o - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-navy-700"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <div className="text-center">
            <p className="text-sm font-semibold text-navy-700">{rangoTexto(inicioLunesUtc)}</p>
            {semanaOffset === 0 && (
              <p className="text-[11px] text-marca-600 font-medium">Semana actual</p>
            )}
            {semanaOffset < 0 && (
              <p className="text-[11px] text-slate-400">
                {semanaOffset === -1 ? "Semana pasada" : `Hace ${Math.abs(semanaOffset)} semanas`}
              </p>
            )}
          </div>

          <button
            onClick={() => setSemanaOffset((o) => Math.min(o + 1, 0))}
            disabled={semanaOffset === 0}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-navy-700 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>

        {/* Aviso de carga */}
        {cargando && (
          <p className="text-center text-sm text-slate-400">Cargando marcas de {nombreTrabajador}...</p>
        )}

        {/* Lista de dias */}
        {!cargando && (
          <div className="space-y-3">
            {dias.map((fecha) => {
              const marcasDia = marcas.filter((m) => isoAFechaMx(m.marcado_en) === fecha);
              const esFuturo = fecha > hoyMx;
              const esAgregandoEste = agregandoFecha === fecha;

              return (
                <div
                  key={fecha}
                  className={`card space-y-3 ${esFuturo ? "opacity-40" : ""}`}
                >
                  {/* Encabezado del dia */}
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold capitalize text-navy-700">
                      {fechaNombreDia(fecha)}
                    </p>
                    {!esFuturo && !esAgregandoEste && (
                      <button
                        onClick={() => {
                          setAgregandoFecha(fecha);
                          setFormAgregar({ tipo: "entrada", hora: "" });
                          setEditando(null);
                        }}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-marca-600 ring-1 ring-marca-200 transition hover:bg-marca-50"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 5v14" />
                          <path d="M5 12h14" />
                        </svg>
                        Agregar
                      </button>
                    )}
                  </div>

                  {/* Marcas del dia */}
                  {marcasDia.length === 0 && !esAgregandoEste ? (
                    <p className="text-xs text-slate-400">
                      {esFuturo ? "Dia futuro" : "Sin marcas"}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {marcasDia.map((m) => {
                        const esEditandoEsta = editando?.marcaId === m.id;
                        return (
                          <div
                            key={m.id}
                            className={`flex items-center gap-2 rounded-lg px-3 py-2 ring-1 ${
                              m.tipo === "entrada"
                                ? "bg-blue-50 ring-blue-100"
                                : m.tipo === "salida"
                                  ? "bg-slate-50 ring-slate-200"
                                  : "bg-amber-50 ring-amber-100"
                            }`}
                          >
                            {/* Chip tipo */}
                            <span
                              className={`w-16 flex-shrink-0 rounded-md px-1.5 py-0.5 text-center text-[10px] font-bold uppercase tracking-wide ${
                                m.tipo === "entrada"
                                  ? "bg-blue-100 text-blue-700"
                                  : m.tipo === "salida"
                                    ? "bg-slate-200 text-slate-600"
                                    : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {ETIQUETA_TIPO[m.tipo]}
                            </span>

                            {/* Hora o input de edicion */}
                            {esEditandoEsta ? (
                              <input
                                type="time"
                                value={editando.hora}
                                onChange={(e) =>
                                  setEditando((prev) => prev ? { ...prev, hora: e.target.value } : null)
                                }
                                className="input-field flex-1 py-1 text-sm"
                                autoFocus
                              />
                            ) : (
                              <span className="flex-1 text-sm font-semibold tabular-nums text-slate-800">
                                {isoAHoraMx(m.marcado_en)}
                              </span>
                            )}

                            {/* Badges */}
                            <div className="flex flex-shrink-0 items-center gap-1">
                              {m.nota === "retardo" && !m.justificada && (
                                <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                                  retardo
                                </span>
                              )}
                              {m.editada_por_admin && (
                                <span className="rounded-md bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-600">
                                  admin
                                </span>
                              )}
                            </div>

                            {/* Acciones */}
                            {esEditandoEsta ? (
                              <div className="flex flex-shrink-0 gap-1">
                                <button
                                  onClick={() => void guardarEdicion()}
                                  disabled={guardando || !editando.hora}
                                  className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  OK
                                </button>
                                <button
                                  onClick={() => setEditando(null)}
                                  className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:ring-slate-400"
                                >
                                  X
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-shrink-0 gap-1">
                                <button
                                  onClick={() =>
                                    setEditando({
                                      marcaId: m.id,
                                      hora: isoAHoraMx(m.marcado_en),
                                    })
                                  }
                                  disabled={guardando}
                                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 ring-1 ring-slate-200 transition hover:ring-navy-400 hover:text-navy-600"
                                  title="Editar hora"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => void eliminar(m.id)}
                                  disabled={guardando}
                                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 ring-1 ring-slate-200 transition hover:ring-rose-400 hover:text-rose-600"
                                  title="Eliminar marca"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 6h18" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Formulario para agregar nueva marca */}
                  {esAgregandoEste && (
                    <div className="space-y-2 rounded-lg bg-marca-50 p-3 ring-1 ring-marca-200">
                      <p className="text-xs font-semibold text-marca-700">Nueva marca</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setFormAgregar((f) => ({ ...f, tipo: "entrada" }))}
                          className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition ${
                            formAgregar.tipo === "entrada"
                              ? "border-blue-400 bg-blue-100 text-blue-700"
                              : "border-slate-200 bg-white text-slate-500"
                          }`}
                        >
                          Entrada
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormAgregar((f) => ({ ...f, tipo: "salida" }))}
                          className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition ${
                            formAgregar.tipo === "salida"
                              ? "border-slate-500 bg-slate-200 text-slate-700"
                              : "border-slate-200 bg-white text-slate-500"
                          }`}
                        >
                          Salida
                        </button>
                        {tienePausaProgramada(fecha) && (
                          <>
                            <button
                              type="button"
                              onClick={() => setFormAgregar((f) => ({ ...f, tipo: "pausa_inicio" }))}
                              className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition ${
                                formAgregar.tipo === "pausa_inicio"
                                  ? "border-amber-400 bg-amber-100 text-amber-700"
                                  : "border-slate-200 bg-white text-slate-500"
                              }`}
                            >
                              Inicio pausa
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormAgregar((f) => ({ ...f, tipo: "pausa_fin" }))}
                              className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition ${
                                formAgregar.tipo === "pausa_fin"
                                  ? "border-amber-400 bg-amber-100 text-amber-700"
                                  : "border-slate-200 bg-white text-slate-500"
                              }`}
                            >
                              Fin pausa
                            </button>
                          </>
                        )}
                      </div>
                      <input
                        type="time"
                        value={formAgregar.hora}
                        onChange={(e) => setFormAgregar((f) => ({ ...f, hora: e.target.value }))}
                        className="input-field w-full"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={cancelarAgregar}
                          className="btn-secondary flex-1 py-1.5 text-xs"
                          disabled={guardando}
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => void guardarNuevaMarca()}
                          disabled={guardando || !formAgregar.hora}
                          className="btn-primary flex-1 py-1.5 text-xs"
                        >
                          {guardando ? "Guardando..." : "Guardar"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
