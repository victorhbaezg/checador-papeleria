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
};

const horariosDefault: HorarioForm[] = DIAS_SEMANA.map((d) => ({
  dia_semana: d.numero,
  hora_entrada_esperada: "09:00",
  hora_salida_esperada: "18:00",
  descansa: d.numero === 0 || d.numero === 6,
}));

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

  // Cargar datos si es edición
  useEffect(() => {
    if (!esEdicion) return;
    const cargar = async () => {
      const { data: t, error: e1 } = await supabase
        .from("trabajadores")
        .select("*")
        .eq("id", id)
        .single();
      if (e1 || !t) {
        setError(e1?.message ?? "No se encontró el trabajador");
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
              }
            : {
                dia_semana: d.numero,
                hora_entrada_esperada: "09:00",
                hora_salida_esperada: "18:00",
                descansa: d.numero === 0 || d.numero === 6,
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
      setError("La tarifa por hora debe ser un número válido");
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
          throw new Error("La contraseña debe tener al menos 6 caracteres");
        }

        const { data, error: errFn } = await supabase.functions.invoke(
          "crear-trabajador",
          {
            body: {
              nombre: nombre.trim(),
              usuario: usuario.trim().toLowerCase(),
              password,
              tarifa_hora: tarifaNum,
              es_admin: esAdmin,
            },
          },
        );

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
        // EDICIÓN: actualizar campos editables
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
        }));
        const { error: errH } = await supabase
          .from("horarios")
          .upsert(filas, { onConflict: "trabajador_id,dia_semana" });
        if (errH) throw new Error(`Trabajador guardado, pero falló el horario: ${errH.message}`);
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
        Cargando…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="mx-auto max-w-2xl">
          <Link
            to="/admin/trabajadores"
            className="text-xs text-slate-500 hover:text-slate-900"
          >
            ← Trabajadores
          </Link>
          <p className="text-base font-semibold text-slate-900">
            {esEdicion ? "Editar trabajador" : "Nuevo trabajador"}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <form onSubmit={guardar} className="space-y-6">
          {error && (
            <div className="card border-l-4 border-red-500 bg-red-50 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Datos básicos */}
          <div className="card space-y-4">
            <h2 className="text-sm font-semibold text-slate-700">Datos personales</h2>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Nombre completo
              </label>
              <input
                className="input-field"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. María García"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Usuario para iniciar sesión
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
                  El usuario no se puede cambiar después de creado.
                </p>
              )}
            </div>

            {!esEdicion && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Contraseña inicial
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  required
                />
                <p className="mt-1 text-xs text-slate-400">
                  Compártela con el trabajador; podrá cambiarla más adelante.
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
                className="h-4 w-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500"
              />
              <span className="text-sm text-slate-700">
                Es administrador (puede gestionar trabajadores y ver reportes)
              </span>
            </label>
          </div>

          {/* Horarios */}
          <div className="card space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">Horario semanal</h2>
              <p className="text-xs text-slate-500">
                Marca los días de descanso o ajusta las horas de cada día.
              </p>
            </div>

            <div className="space-y-2">
              {horarios.map((h) => {
                const dia = DIAS_SEMANA.find((d) => d.numero === h.dia_semana)!;
                return (
                  <div
                    key={h.dia_semana}
                    className="grid grid-cols-12 items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"
                  >
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
              {guardando ? "Guardando…" : esEdicion ? "Guardar cambios" : "Crear trabajador"}
            </button>
          </div>
        </form>

        {/* Zona peligrosa: solo en edición y si no soy yo mismo */}
        {esEdicion && trabajadorActual && trabajadorActual.id !== usuarioActual?.id && (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50/40 p-6">
            <h2 className="text-sm font-semibold text-red-800">Zona peligrosa</h2>
            <p className="mt-1 text-xs text-red-700">
              Elimina permanentemente al trabajador y todo su historial de marcas. No se puede deshacer.
            </p>
            <button
              type="button"
              onClick={() => setMostrarConfirmar(true)}
              className="mt-3 inline-flex items-center justify-center rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
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
