import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, type Trabajador, type HorarioExcepcion } from "../../lib/supabase";

type FormData = {
  trabajadorId: string;
  fecha: string;
  esDiaLibre: boolean;
  horaEntrada: string;
  horaSalida: string;
  tienePausa: boolean;
  horaPausaInicio: string;
  horaPausaFin: string;
  nota: string;
};

const FORM_VACIO: FormData = {
  trabajadorId: "",
  fecha: "",
  esDiaLibre: false,
  horaEntrada: "",
  horaSalida: "",
  tienePausa: false,
  horaPausaInicio: "16:30",
  horaPausaFin: "17:00",
  nota: "",
};

function fechaCorta(fecha: string): string {
  const [yyyy, mm, dd] = fecha.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function horaCorta(hora: string | null): string {
  if (!hora) return "--";
  return hora.substring(0, 5); // "HH:MM"
}

export default function ExcepcionesHorario() {
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [seleccionado, setSeleccionado] = useState<string>("");
  const [excepciones, setExcepciones] = useState<HorarioExcepcion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState<FormData>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void cargarTrabajadores();
  }, []);

  useEffect(() => {
    if (seleccionado) {
      void cargarExcepciones(seleccionado);
    }
  }, [seleccionado]);

  const cargarTrabajadores = async () => {
    const { data } = await supabase
      .from("trabajadores")
      .select("*")
      .eq("activo", true)
      .order("nombre", { ascending: true });
    const lista = (data ?? []) as Trabajador[];
    setTrabajadores(lista);
    if (lista.length > 0) {
      setSeleccionado(lista[0].id);
    }
    setCargando(false);
  };

  const cargarExcepciones = async (trabajadorId: string) => {
    const { data } = await supabase
      .from("horario_excepciones")
      .select("*")
      .eq("trabajador_id", trabajadorId)
      .order("fecha", { ascending: true });
    setExcepciones((data ?? []) as HorarioExcepcion[]);
  };

  const abrirForm = () => {
    setForm({ ...FORM_VACIO, trabajadorId: seleccionado });
    setError(null);
    setMostrarForm(true);
  };

  const cerrarForm = () => {
    setMostrarForm(false);
    setError(null);
  };

  const guardar = async () => {
    if (!form.fecha) {
      setError("Selecciona una fecha.");
      return;
    }
    if (!form.esDiaLibre && (!form.horaEntrada || !form.horaSalida)) {
      setError("Ingresa la hora de entrada y salida, o marca como dia libre.");
      return;
    }

    const conPausa = !form.esDiaLibre && form.tienePausa;
    if (conPausa && (!form.horaPausaInicio || !form.horaPausaFin)) {
      setError("Ingresa la hora de inicio y fin de la pausa, o desactiva la pausa.");
      return;
    }

    setGuardando(true);
    setError(null);

    const payload: Record<string, unknown> = {
      trabajador_id: form.trabajadorId,
      fecha: form.fecha,
      es_dia_libre: form.esDiaLibre,
      hora_entrada_esperada: form.esDiaLibre ? null : `${form.horaEntrada}:00`,
      hora_salida_esperada: form.esDiaLibre ? null : `${form.horaSalida}:00`,
      hora_pausa_inicio: conPausa ? `${form.horaPausaInicio}:00` : null,
      hora_pausa_fin: conPausa ? `${form.horaPausaFin}:00` : null,
      nota: form.nota.trim() || null,
    };

    const { error: err } = await supabase
      .from("horario_excepciones")
      .upsert(payload, { onConflict: "trabajador_id,fecha" });

    if (err) {
      setError(err.message);
      setGuardando(false);
      return;
    }

    await cargarExcepciones(form.trabajadorId);
    setGuardando(false);
    setMostrarForm(false);
  };

  const eliminar = async (id: string) => {
    await supabase.from("horario_excepciones").delete().eq("id", id);
    setExcepciones((prev) => prev.filter((e) => e.id !== id));
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
          <p className="text-sm font-semibold text-white">Excepciones de horario</p>
          <span className="w-14" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        <div>
          <h1 className="text-lg font-bold text-navy-700">Excepciones de horario</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Cambia el horario de un trabajador para una fecha especifica,
            o marcalo como dia libre sin que cuente como falta.
          </p>
        </div>

        {cargando && (
          <p className="text-sm text-slate-400">Cargando trabajadores...</p>
        )}

        {!cargando && (
          <>
            {/* Selector de trabajador */}
            <div className="card space-y-3">
              <label className="label-section">Trabajador</label>
              <select
                value={seleccionado}
                onChange={(e) => setSeleccionado(e.target.value)}
                className="input-field w-full"
              >
                {trabajadores.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>

              <button onClick={abrirForm} className="btn-primary w-full">
                + Nueva excepcion para {nombreTrabajador}
              </button>
            </div>

            {/* Formulario de nueva excepcion */}
            {mostrarForm && (
              <div className="card space-y-4 ring-2 ring-marca-400">
                <p className="label-section">Nueva excepcion</p>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Fecha
                  </label>
                  <input
                    type="date"
                    value={form.fecha}
                    onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                    className="input-field w-full"
                  />
                </div>

                {/* Tipo: dia libre o cambio de horario */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, esDiaLibre: false }))}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                      !form.esDiaLibre
                        ? "border-marca-500 bg-marca-50 text-marca-700"
                        : "border-slate-200 bg-white text-slate-500"
                    }`}
                  >
                    Cambio de horario
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, esDiaLibre: true }))}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                      form.esDiaLibre
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-white text-slate-500"
                    }`}
                  >
                    Dia libre
                  </button>
                </div>

                {!form.esDiaLibre && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Entrada
                      </label>
                      <input
                        type="time"
                        value={form.horaEntrada}
                        onChange={(e) => setForm((f) => ({ ...f, horaEntrada: e.target.value }))}
                        className="input-field w-full"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Salida
                      </label>
                      <input
                        type="time"
                        value={form.horaSalida}
                        onChange={(e) => setForm((f) => ({ ...f, horaSalida: e.target.value }))}
                        className="input-field w-full"
                      />
                    </div>
                  </div>
                )}

                {/* Pausa de la excepcion (solo en cambio de horario) */}
                {!form.esDiaLibre && (
                  <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                    <label className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-slate-700">
                        Pausa este dia
                      </span>
                      <input
                        type="checkbox"
                        checked={form.tienePausa}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, tienePausa: e.target.checked }))
                        }
                        className="h-4 w-4 accent-marca-500"
                      />
                    </label>

                    {form.tienePausa && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">
                            Inicio pausa
                          </label>
                          <input
                            type="time"
                            value={form.horaPausaInicio}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, horaPausaInicio: e.target.value }))
                            }
                            className="input-field w-full"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">
                            Fin pausa
                          </label>
                          <input
                            type="time"
                            value={form.horaPausaFin}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, horaPausaFin: e.target.value }))
                            }
                            className="input-field w-full"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Nota (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="p. ej. Cita medica, evento especial..."
                    value={form.nota}
                    onChange={(e) => setForm((f) => ({ ...f, nota: e.target.value }))}
                    className="input-field w-full"
                  />
                </div>

                {error && (
                  <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
                    {error}
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={cerrarForm}
                    className="btn-secondary flex-1"
                    disabled={guardando}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={guardar}
                    className="btn-primary flex-1"
                    disabled={guardando}
                  >
                    {guardando ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </div>
            )}

            {/* Lista de excepciones */}
            {excepciones.length === 0 && !mostrarForm && (
              <div className="card text-center text-sm text-slate-500">
                No hay excepciones registradas para {nombreTrabajador}.
              </div>
            )}

            {excepciones.length > 0 && (
              <div className="space-y-2">
                {excepciones.map((exc) => (
                  <div key={exc.id} className="card flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            exc.es_dia_libre
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {exc.es_dia_libre ? "Dia libre" : "Cambio horario"}
                        </span>
                        <p className="text-sm font-semibold text-navy-700">
                          {fechaCorta(exc.fecha)}
                        </p>
                      </div>
                      {!exc.es_dia_libre && (
                        <p className="mt-1 text-xs text-slate-500">
                          Entrada {horaCorta(exc.hora_entrada_esperada)} &middot; Salida {horaCorta(exc.hora_salida_esperada)}
                        </p>
                      )}
                      {!exc.es_dia_libre && exc.hora_pausa_inicio && exc.hora_pausa_fin && (
                        <p className="mt-0.5 text-xs text-slate-400">
                          Pausa {horaCorta(exc.hora_pausa_inicio)} &ndash; {horaCorta(exc.hora_pausa_fin)}
                        </p>
                      )}
                      {exc.nota && (
                        <p className="mt-1 text-xs text-slate-400">{exc.nota}</p>
                      )}
                    </div>
                    <button
                      onClick={() => void eliminar(exc.id)}
                      className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                      title="Eliminar excepcion"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
