import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase, type Horario, type Trabajador } from "../../lib/supabase";
import { DIAS_SEMANA, hhmm } from "../../lib/dias";
import { useAuth } from "../../lib/auth";
import ConfirmarEliminarTrabajador from "../../components/ConfirmarEliminarTrabajador";

type HorarioForm = {
  dia_semana: number;
  hora_entrada_esperada: string;
  hora_salida_esperada: string;
  descansa: boolean;
  tiene_pausa: boolean;
  hora_pausa_inicio: string;
  hora_pausa_fin: string;
};

const horariosDefault: HorarioForm[] = DIAS_SEMANA.map((d) => ({
  dia_semana: d.numero,
  hora_entrada_esperada: "09:00",
  hora_salida_esperada: "18:00",
  descansa: d.numero === 0 || d.numero === 6,
  tiene_pausa: false,
  hora_pausa_inicio: "16:30",
  hora_pausa_fin: "17:00",
}));

// Limite de tiempo para llamadas de red que pueden colgarse (p.ej. la Edge
// Function si el token tarda en renovarse). Sin esto, si invoke() nunca
// resuelve, el boton se queda en "Guardando..." para siempre.
function conLimite<T>(p: Promise<T>, ms = 20000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(
      () => reject(new Error("La solicitud tardo demasiado. Revisa tu conexion y reintenta.")),
      ms,
    );
    p.then(
      (v) => { clearTimeout(id); resolve(v); },
      (e) => { clearTimeout(id); reject(e); },
    );
  });
}

export default function TrabajadorForm() {
  const { id } = useParams<{ id: string }>();
  const esEdicion = Boolean(id);
  const navigate = useNavigate();
  const { trabajador: usuarioActual } = useAuth();

  const [nombre, setNombre] = useState("");
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [tarifaHora, setTarifaHora] = useState("");
  const [esAdmin, setEsAdmin] = useState(false);
  const [horarios, setHorarios] = useState<HorarioForm[]>(horariosDefault);
  const [trabajadorActual, setTrabajadorActual] = useState<Trabajador | null>(null);
  const [mostrarConfirmar, setMostrarConfirmar] = useState(false);

  const [cargando, setCargando] = useState(esEdicion);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar datos si es edicion
  useEffect(() => {
    if (!esEdicion) return;
    const cargar = async () => {
      const { data: t, error: e1 } = await supabase
        .from("trabajadores")
        .select("*")
        .eq("id", id)
        .single();
      if (e1 || !t) {
        setError(e1?.message ?? "No se encontro el trabajador");
        setCargando(false);
        return;
      }
      const trab = t as Trabajador;
      setTrabajadorActual(trab);
      setNombre(trab.nombre);
      setUsuario(trab.usuario);
      setTarifaHora(String(trab.tarifa_hora));
      setEsAdmin(trab.es_admin);

      const { data: hs } = await supabase
        .from("horarios")
        .select("*")
        .eq("trabajador_id", id);

      const mapa = new Map<number, Horario>();
      ((hs as Horario[]) ?? []).forEach((h) => mapa.set(h.dia_semana, h));

      setHorarios(
        DIAS_SEMANA.map((d) => {
          const h = mapa.get(d.numero);
          return h
            ? {
                dia_semana: d.numero,
                hora_entrada_esperada: hhmm(h.hora_entrada_esperada),
                hora_salida_esperada: hhmm(h.hora_salida_esperada),
                descansa: h.descansa,
                tiene_pausa: Boolean(h.hora_pausa_inicio && h.hora_pausa_fin),
                hora_pausa_inicio: h.hora_pausa_inicio ? hhmm(h.hora_pausa_inicio) : "16:30",
                hora_pausa_fin: h.hora_pausa_fin ? hhmm(h.hora_pausa_fin) : "17:00",
              }
            : {
                dia_semana: d.numero,
                hora_entrada_esperada: "09:00",
                hora_salida_esperada: "18:00",
                descansa: d.numero === 0 || d.numero === 6,
                tiene_pausa: false,
                hora_pausa_inicio: "16:30",
                hora_pausa_fin: "17:00",
              };
        }),
      );
      setCargando(false);
    };
    cargar();
  }, [id, esEdicion]);

  const actualizarHorario = (
    dia: number,
    cambio: Partial<HorarioForm>,
  ) => {
    setHorarios((prev) =>
      prev.map((h) => (h.dia_semana === dia ? { ...h, ...cambio } : h)),
    );
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGuardando(true);

    const tarifaNum = parseFloat(tarifaHora);
    if (!nombre.trim()) {
      setError("El nombre es obligatorio");
      setGuardando(false);
      return;
    }
    if (!Number.isFinite(tarifaNum) || tarifaNum < 0) {
      setError("La tarifa por hora debe ser un numero valido");
      setGuardando(false);
      return;
    }

    try {
      let trabajadorId = id;

      if (!esEdicion) {
        // ALTA: llamar Edge Function
        if (!usuario.trim()) {
          throw new Error("El usuario es obligatorio");
        }
        if (password.length < 6) {
          throw new Error("La contrasena debe tener al menos 6 caracteres");
        }

        // Obtener el token de la sesion explicitamente (lectura local rapida).
        // Lo pasamos a mano en vez de dejar que invoke() lo busque por dentro,
        // que es donde se colgaba de forma intermitente.
        const { data: ses } = await conLimite(supabase.auth.getSession(), 6000);
        const token = ses?.session?.access_token;
        if (!token) {
          throw new Error("Tu sesion expiro. Cierra sesion y vuelve a entrar.");
        }

        const respuesta = (await conLimite(
          supabase.functions.invoke("crear-trabajador", {
            headers: { Authorization: `Bearer ${token}` },
            body: {
              nombre: nombre.trim(),
              usuario: usuario.trim().toLowerCase(),
              password,
              tarifa_hora: tarifaNum,
              es_admin: esAdmin,
            },
          }),
        )) as {
          data: { trabajador?: { id?: string }; error?: string } | null;
          error: { message: string; context?: Response } | null;
        };
        const data = respuesta.data;
        const errFn = respuesta.error;

        if (errFn) {
          // Intentar leer el mensaje del cuerpo de respuesta
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
        trabajadorId = data?.trabajador?.id;
      } else {
        // EDICION: actualizar campos editables
        const { error: errUp } = await supabase
          .from("trabajadores")
          .update({
            nombre: nombre.trim(),
            tarifa_hora: tarifaNum,
            es_admin: esAdmin,
            actualizado_en: new Date().toISOString(),
          })
          .eq("id", id);
        if (errUp) throw new Error(errUp.message);
      }

      // Guardar horarios (upsert por trabajador_id + dia_semana)
      if (trabajadorId) {
        const filas = horarios.map((h) => ({
          trabajador_id: trabajadorId!,
          dia_semana: h.dia_semana,
          hora_entrada_esperada: `${h.hora_entrada_esperada}:00`,
          hora_salida_esperada: `${h.hora_salida_esperada}:00`,
          descansa: h.descansa,
          hora_pausa_inicio:
            h.tiene_pausa && !h.descansa ? `${h.hora_pausa_inicio}:00` : null,
          hora_pausa_fin:
            h.tiene_pausa && !h.descansa ? `${h.hora_pausa_fin}:00` : null,
        }));
        const { error: errH } = await supabase
          .from("horarios")
          .upsert(filas, { onConflict: "trabajador_id,dia_semana" });
        if (errH) throw new Error(`Trabajador guardado, pero fallo el horario: ${errH.message}`);
      }

      navigate("/admin/trabajadores");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        Cargando...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-navy-700">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <Link
            to="/admin/trabajadores"
            className="flex items-center gap-1 text-[11px] font-medium text-navy-200 transition hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            Trabajadores
          </Link>
          <p className="text-sm font-semibold text-white">
            {esEdicion ? "Editar trabajador" : "Nuevo trabajador"}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <form onSubmit={guardar} className="space-y-6">
          {error && (
            <div className="rounded-lg bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-rose-200">
              {error}
            </div>
          )}

          {/* Datos basicos */}
          <div className="card space-y-4">
            <h2 className="label-section">Datos personales</h2>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Nombre completo
              </label>
              <input
                className="input-field"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Maria Garcia"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Usuario para iniciar sesion
              </label>
              <input
                className="input-field"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                placeholder="Ej. maria"
                disabled={esEdicion}
                required
              />
              {esEdicion && (
                <p className="mt-1 text-xs text-slate-400">
                  El usuario no se puede cambiar despues de creado.
                </p>
              )}
            </div>

            {!esEdicion && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Contrasena inicial
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimo 6 caracteres"
                  minLength={6}
                  required
                />
                <p className="mt-1 text-xs text-slate-400">
                  Compartela con el trabajador; podra cambiarla mas adelante.
                </p>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Tarifa por hora (MXN)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input-field"
                value={tarifaHora}
                onChange={(e) => setTarifaHora(e.target.value)}
                placeholder="Ej. 35.00"
                required
              />
            </div>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={esAdmin}
                onChange={(e) => setEsAdmin(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-navy-700 focus:ring-navy-700"
              />
              <span className="text-sm text-slate-700">
                Es administrador (puede gestionar trabajadores y ver reportes)
              </span>
            </label>
          </div>

          {/* Horarios */}
          <div className="card space-y-3">
            <div>
              <h2 className="label-section">Horario semanal</h2>
              <p className="mt-1 text-xs text-slate-500">
                Marca los dias de descanso o ajusta las horas de cada dia.
              </p>
            </div>

            <div className="space-y-2">
              {horarios.map((h) => {
                const dia = DIAS_SEMANA.find((d) => d.numero === h.dia_semana)!;
                return (
                  <div
                    key={h.dia_semana}
                    className="space-y-2 rounded-lg bg-slate-50 px-3 py-2"
                  >
                  <div className="grid grid-cols-12 items-center gap-2">
                    <span className="col-span-3 text-sm font-medium text-slate-700">
                      {dia.largo}
                    </span>

                    <label className="col-span-3 flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={h.descansa}
                        onChange={(e) =>
                          actualizarHorario(h.dia_semana, {
                            descansa: e.target.checked,
                          })
                        }
                        className="h-4 w-4"
                      />
                      Descansa
                    </label>

                    <input
                      type="time"
                      value={h.hora_entrada_esperada}
                      onChange={(e) =>
                        actualizarHorario(h.dia_semana, {
                          hora_entrada_esperada: e.target.value,
                        })
                      }
                      disabled={h.descansa}
                      className="col-span-3 rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                    />

                    <input
                      type="time"
                      value={h.hora_salida_esperada}
                      onChange={(e) =>
                        actualizarHorario(h.dia_semana, {
                          hora_salida_esperada: e.target.value,
                        })
                      }
                      disabled={h.descansa}
                      className="col-span-3 rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>

                  {/* Pausa programada (opcional) */}
                  {!h.descansa && (
                    <div className="border-t border-slate-200 pt-2">
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={h.tiene_pausa}
                          onChange={(e) =>
                            actualizarHorario(h.dia_semana, {
                              tiene_pausa: e.target.checked,
                            })
                          }
                          className="h-4 w-4"
                        />
                        Tiene pausa a media jornada (sale y regresa)
                      </label>

                      {h.tiene_pausa && (
                        <div className="mt-2 flex items-center gap-2 pl-6">
                          <span className="text-xs text-slate-500">Sale</span>
                          <input
                            type="time"
                            value={h.hora_pausa_inicio}
                            onChange={(e) =>
                              actualizarHorario(h.dia_semana, {
                                hora_pausa_inicio: e.target.value,
                              })
                            }
                            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                          />
                          <span className="text-xs text-slate-500">Regresa</span>
                          <input
                            type="time"
                            value={h.hora_pausa_fin}
                            onChange={(e) =>
                              actualizarHorario(h.dia_semana, {
                                hora_pausa_fin: e.target.value,
                              })
                            }
                            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Acciones */}
          <div className="flex justify-end gap-3">
            <Link to="/admin/trabajadores" className="btn-secondary">
              Cancelar
            </Link>
            <button type="submit" disabled={guardando} className="btn-primary">
              {guardando ? "Guardando..." : esEdicion ? "Guardar cambios" : "Crear trabajador"}
            </button>
          </div>
        </form>

        {/* Zona peligrosa: solo en edicion y si no soy yo mismo */}
        {esEdicion && trabajadorActual && trabajadorActual.id !== usuarioActual?.id && (
          <div className="mt-8 rounded-lg bg-rose-50 p-6 ring-1 ring-rose-200">
            <h2 className="label-section text-rose-700">Zona peligrosa</h2>
            <p className="mt-1 text-xs text-rose-700">
              Elimina permanentemente al trabajador y todo su historial de marcas. No se puede deshacer.
            </p>
            <button
              type="button"
              onClick={() => setMostrarConfirmar(true)}
              className="mt-3 inline-flex items-center justify-center rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
            >
              Eliminar permanentemente
            </button>
          </div>
        )}
      </main>

      {mostrarConfirmar && trabajadorActual && (
        <ConfirmarEliminarTrabajador
          trabajador={trabajadorActual}
          onCancelar={() => setMostrarConfirmar(false)}
          onEliminado={() => {
            setMostrarConfirmar(false);
            navigate("/admin/trabajadores");
          }}
        />
      )}
    </div>
  );
}
