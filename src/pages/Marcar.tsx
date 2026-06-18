import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { useAuth } from "../lib/auth";
import {
  supabase,
  type Configuracion,
  type Horario,
  type HorarioExcepcion,
  type Marca,
  type TipoMarca,
} from "../lib/supabase";
import {
  diaSemanaMx,
  esRetardo,
  esRetardoPausa,
  fechaHoyMx,
  formatoHoraMx,
  minutosTarde,
  minutosTardePausa,
  siguienteAccion,
  ZONA_HORARIA,
} from "../lib/marcado";
import {
  cargarTareas,
  alternarTarea,
  type ResumenTareas,
  type TareaConEstado,
} from "../lib/tareas";

type Estado =
  | { kind: "preparando" }
  | { kind: "esperando_scan" }
  | { kind: "procesando" }
  | { kind: "exito"; tipo: TipoMarca; hora: string; tareas: ResumenTareas | null }
  | { kind: "error"; mensaje: string };

const QR_ELEMENT_ID = "qr-reader";

export default function Marcar() {
  const { trabajador } = useAuth();
  const navigate = useNavigate();

  const [estado, setEstado] = useState<Estado>({ kind: "preparando" });
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const procesandoRef = useRef(false);

  useEffect(() => {
    if (!trabajador) return;

    let cancelado = false;
    const scanner = new Html5Qrcode(QR_ELEMENT_ID, /* verbose */ false);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          if (cancelado || procesandoRef.current) return;
          procesandoRef.current = true;
          procesarEscaneo(decoded);
        },
        () => undefined,
      )
      .then(() => {
        if (!cancelado) setEstado({ kind: "esperando_scan" });
      })
      .catch((err: unknown) => {
        if (cancelado) return;
        const msg = err instanceof Error ? err.message : String(err);
        setEstado({
          kind: "error",
          mensaje: `No se pudo abrir la camara: ${msg}`,
        });
      });

    return () => {
      cancelado = true;
      void detenerScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trabajador?.id]);

  const detenerScanner = async () => {
    const s = scannerRef.current;
    if (!s) return;
    try {
      if (s.getState() === Html5QrcodeScannerState.SCANNING) {
        await s.stop();
      }
      s.clear();
    } catch {
      // ignorar
    }
    scannerRef.current = null;
  };

  const procesarEscaneo = async (codigoEscaneado: string) => {
    if (!trabajador) return;
    setEstado({ kind: "procesando" });

    try {
      // 1) Traer configuracion para validar el QR
      const { data: configData, error: errConfig } = await supabase
        .from("configuracion")
        .select("*")
        .eq("id", 1)
        .single();
      if (errConfig || !configData) {
        throw new Error(errConfig?.message ?? "No se pudo leer la configuracion.");
      }
      const config = configData as Configuracion;
      const qrValido = codigoEscaneado.trim() === config.qr_local.trim();

      if (!qrValido) {
        setEstado({
          kind: "error",
          mensaje: "Ese codigo no es el del local. Pidele a Hugo el QR correcto.",
        });
        procesandoRef.current = false;
        return;
      }

      // 2) Traer marcas de hoy del trabajador
      const hoyMx = fechaHoyMx();
      const inicioHoyUtc = new Date(`${hoyMx}T06:00:00.000Z`);
      const finHoyUtc = new Date(inicioHoyUtc.getTime() + 24 * 60 * 60 * 1000);

      const { data: marcasHoyData, error: errMarcas } = await supabase
        .from("marcas")
        .select("*")
        .eq("trabajador_id", trabajador.id)
        .gte("marcado_en", inicioHoyUtc.toISOString())
        .lt("marcado_en", finHoyUtc.toISOString())
        .order("marcado_en", { ascending: true });
      if (errMarcas) throw new Error(errMarcas.message);

      const marcasHoy = (marcasHoyData ?? []) as Marca[];
      const ahora = new Date();
      const dia = diaSemanaMx(ahora);

      // 3) Horario regular del dia (de aqui sale la pausa programada)
      const { data: horarioData } = await supabase
        .from("horarios")
        .select("*")
        .eq("trabajador_id", trabajador.id)
        .eq("dia_semana", dia)
        .maybeSingle();
      const horarioRegular = (horarioData as Horario | null) ?? null;

      // 4) Decidir el tipo de marca considerando la pausa programada
      const tipo = siguienteAccion(marcasHoy, horarioRegular, ahora);

      // 5) Revisamos retardo en la entrada (con excepciones) y tambien en el
      //    regreso de pausa (vs hora_pausa_fin, con la misma tolerancia).
      //    Si hay retardo, guardamos cuantos minutos tarde para descontarlos
      //    despues si se acumulan en la semana.
      let fueRetardo = false;
      let minTarde = 0;
      if (tipo === "entrada") {
        const { data: excepcionData } = await supabase
          .from("horario_excepciones")
          .select("*")
          .eq("trabajador_id", trabajador.id)
          .eq("fecha", hoyMx)
          .maybeSingle();
        const excepcion = excepcionData as HorarioExcepcion | null;

        let horarioEfectivo: Horario | null = horarioRegular;
        if (excepcion && excepcion.es_dia_libre) {
          horarioEfectivo = null; // dia libre: sin retardo posible
        } else if (excepcion && excepcion.hora_entrada_esperada) {
          horarioEfectivo = {
            id: "",
            trabajador_id: trabajador.id,
            dia_semana: dia,
            hora_entrada_esperada: excepcion.hora_entrada_esperada,
            hora_salida_esperada: excepcion.hora_salida_esperada ?? "00:00:00",
            descansa: false,
            hora_pausa_inicio: null,
            hora_pausa_fin: null,
          };
        }

        fueRetardo = esRetardo(ahora, horarioEfectivo, config.tolerancia_retardo_minutos);
        if (fueRetardo) minTarde = minutosTarde(ahora, horarioEfectivo);
      } else if (tipo === "pausa_fin") {
        // Regreso de pausa: cuenta retardo si vuelve tarde (con tolerancia).
        // No se aplican excepciones porque estas no definen horario de pausa.
        fueRetardo = esRetardoPausa(
          ahora,
          horarioRegular,
          config.tolerancia_retardo_minutos,
        );
        if (fueRetardo) minTarde = minutosTardePausa(ahora, horarioRegular);
      }

      // 6) Insertar la marca
      const nota = fueRetardo ? "retardo" : null;
      const { error: errInsert } = await supabase.from("marcas").insert({
        trabajador_id: trabajador.id,
        tipo,
        marcado_en: ahora.toISOString(),
        qr_codigo_escaneado: codigoEscaneado,
        qr_valido: true,
        nota,
        minutos_tarde: fueRetardo ? minTarde : null,
      });
      if (errInsert) throw new Error(errInsert.message);

      // 7) Para entrada y salida traemos las tareas del dia y de la semana.
      //    En la entrada se muestran como recordatorio; en la salida se marcan.
      let tareas: ResumenTareas | null = null;
      if (tipo === "entrada" || tipo === "salida") {
        try {
          tareas = await cargarTareas(trabajador.id, ahora);
        } catch {
          tareas = null;
        }
      }

      // 8) Apagar camara y mostrar exito
      await detenerScanner();
      setEstado({ kind: "exito", tipo, hora: ahora.toISOString(), tareas });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      setEstado({ kind: "error", mensaje });
      procesandoRef.current = false;
    }
  };

  if (!trabajador) return null;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-navy-700">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-4">
          <Link
            to="/"
            className="flex items-center gap-1 text-sm font-medium text-navy-100 transition hover:text-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            Atras
          </Link>
          <p className="text-sm font-semibold text-white">Marcar asistencia</p>
          <span className="w-14" />
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 py-6">
        {estado.kind === "exito" ? (
          <PantallaExito
            tipo={estado.tipo}
            hora={estado.hora}
            tareas={estado.tareas}
            trabajadorId={trabajador.id}
            onIrAHome={() => navigate("/")}
          />
        ) : (
          <>
            <div className="card">
              <p className="label-section">Escaner</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                Apunta tu camara al QR del local
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {estado.kind === "preparando" && "Preparando la camara..."}
                {estado.kind === "esperando_scan" &&
                  "La app detecta automaticamente entrada, salida o pausa segun tu horario."}
                {estado.kind === "procesando" && "Procesando marca..."}
                {estado.kind === "error" && "Hubo un problema. Lee el aviso abajo."}
              </p>
            </div>

            <div
              id={QR_ELEMENT_ID}
              className="overflow-hidden rounded-lg bg-black ring-1 ring-slate-300"
              style={{ minHeight: 280 }}
            />

            {estado.kind === "error" && (
              <div className="rounded-lg bg-rose-50 p-5 text-sm text-rose-700 ring-1 ring-rose-200">
                <p className="font-semibold">No se pudo registrar la marca</p>
                <p className="mt-1">{estado.mensaje}</p>
                <button
                  onClick={() => {
                    procesandoRef.current = false;
                    setEstado({ kind: "esperando_scan" });
                  }}
                  className="btn-primary mt-3 w-full"
                >
                  Volver a intentar
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

const ETIQUETAS: Record<TipoMarca, { titulo: string; nota: string }> = {
  entrada: { titulo: "Entrada registrada", nota: "Que tengas buen turno." },
  salida: { titulo: "Salida registrada", nota: "Gracias por tu trabajo de hoy." },
  pausa_inicio: {
    titulo: "Pausa iniciada",
    nota: "Vuelve a escanear el QR cuando regreses.",
  },
  pausa_fin: { titulo: "Regreso registrado", nota: "Bienvenida de vuelta." },
};

function PantallaExito({
  tipo,
  hora,
  tareas,
  trabajadorId,
  onIrAHome,
}: {
  tipo: TipoMarca;
  hora: string;
  tareas: ResumenTareas | null;
  trabajadorId: string;
  onIrAHome: () => void;
}) {
  // En la salida el trabajador puede marcar sus tareas aqui mismo.
  const [resumen, setResumen] = useState<ResumenTareas | null>(tareas);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const alternar = async (t: TareaConEstado) => {
    if (tipo !== "salida" || guardandoId) return;
    setGuardandoId(t.id);
    setResumen((prev) => recalcular(prev, t.id));
    try {
      await alternarTarea(t, trabajadorId);
    } catch {
      setResumen((prev) => recalcular(prev, t.id)); // revertir si falla
    } finally {
      setGuardandoId(null);
    }
  };

  const fechaLarga = new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA_HORARIA,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(hora));

  const etiqueta = ETIQUETAS[tipo];

  return (
    <div className="space-y-4">
      <div className="card text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-200">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <p className="label-section">{etiqueta.titulo}</p>
        <p className="mt-1 text-3xl font-bold text-navy-700">{formatoHoraMx(hora)}</p>
        <p className="mt-1 text-sm capitalize text-slate-500">{fechaLarga}</p>
        <p className="mt-2 text-xs text-slate-400">{etiqueta.nota}</p>
      </div>

      {/* Tareas: recordatorio al entrar, checklist para marcar al cerrar */}
      {(tipo === "entrada" || tipo === "salida") && resumen && resumen.total > 0 && (
        <div className="card">
          <div className="flex items-center justify-between">
            <p className="label-section">
              {tipo === "salida" ? "Estado de tus tareas" : "Tus tareas"}
            </p>
            <span
              className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                resumen.pendientes === 0
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {resumen.hechas}/{resumen.total}
            </span>
          </div>

          <p className="mt-1 text-xs text-slate-500">
            {tipo === "salida"
              ? resumen.pendientes === 0
                ? "Terminaste todo. Bien hecho."
                : "Marca lo que completaste antes de irte."
              : resumen.pendientes === 0
                ? "Ya tienes todo marcado por hoy."
                : `Tienes ${resumen.pendientes} tarea${resumen.pendientes === 1 ? "" : "s"} para hoy. Recuerda marcarlas al salir.`}
          </p>

          <TareasChecklist
            items={resumen.items}
            interactivo={tipo === "salida"}
            guardandoId={guardandoId}
            onAlternar={alternar}
          />
        </div>
      )}

      {tipo === "salida" && resumen && resumen.pendientes > 0 ? (
        confirmando ? (
          <div className="card border border-amber-200 bg-amber-50">
            <p className="text-sm font-semibold text-amber-800">
              Te faltan {resumen.pendientes} tarea{resumen.pendientes === 1 ? "" : "s"} por marcar
            </p>
            <p className="mt-1 text-xs text-amber-700">
              Si sales asi, contaran como no hechas y pueden afectar tu bono del mes.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setConfirmando(false)}
                className="btn-secondary flex-1"
              >
                Seguir marcando
              </button>
              <button
                onClick={onIrAHome}
                className="flex-1 rounded-lg bg-amber-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-700"
              >
                Salir asi
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmando(true)}
            className="w-full rounded-lg bg-amber-600 px-4 py-4 text-sm font-semibold text-white transition hover:bg-amber-700"
          >
            Listo ({resumen.pendientes} sin marcar)
          </button>
        )
      ) : (
        <button onClick={onIrAHome} className="btn-primary w-full">
          Listo
        </button>
      )}
    </div>
  );
}

function TareasChecklist({
  items,
  interactivo,
  guardandoId,
  onAlternar,
}: {
  items: TareaConEstado[];
  interactivo: boolean;
  guardandoId: string | null;
  onAlternar: (t: TareaConEstado) => void;
}) {
  const diarias = items.filter((t) => t.frecuencia === "diaria");
  const semanales = items.filter((t) => t.frecuencia === "semanal");
  return (
    <div className="mt-3 space-y-3">
      {diarias.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            De hoy
          </p>
          {diarias.map((t) => (
            <FilaCheck
              key={t.id}
              tarea={t}
              interactivo={interactivo}
              guardando={guardandoId === t.id}
              onAlternar={() => onAlternar(t)}
            />
          ))}
        </div>
      )}
      {semanales.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            De la semana
          </p>
          {semanales.map((t) => (
            <FilaCheck
              key={t.id}
              tarea={t}
              interactivo={interactivo}
              guardando={guardandoId === t.id}
              onAlternar={() => onAlternar(t)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilaCheck({
  tarea,
  interactivo,
  guardando,
  onAlternar,
}: {
  tarea: TareaConEstado;
  interactivo: boolean;
  guardando: boolean;
  onAlternar: () => void;
}) {
  const contenido = (
    <>
      <span
        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 transition ${
          tarea.hecha
            ? "border-emerald-600 bg-emerald-600 text-white"
            : "border-slate-300 bg-white"
        }`}
      >
        {tarea.hecha && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        )}
      </span>
      <span
        className={`flex-1 text-sm ${
          tarea.hecha ? "text-slate-400 line-through" : "text-slate-800"
        }`}
      >
        {tarea.titulo}
      </span>
    </>
  );

  if (!interactivo) {
    return (
      <div
        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 ring-1 ${
          tarea.hecha ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-slate-200"
        }`}
      >
        {contenido}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onAlternar}
      disabled={guardando}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left ring-1 transition disabled:opacity-60 ${
        tarea.hecha
          ? "bg-emerald-50 ring-emerald-200"
          : "bg-white ring-slate-200 hover:ring-navy-300"
      }`}
    >
      {contenido}
    </button>
  );
}

/** Invierte el estado de una tarea para el update optimista. */
function recalcular(prev: ResumenTareas | null, tareaId: string): ResumenTareas | null {
  if (!prev) return prev;
  const items = prev.items.map((t) =>
    t.id === tareaId ? { ...t, hecha: !t.hecha } : t,
  );
  const hechas = items.filter((i) => i.hecha).length;
  return { items, total: items.length, hechas, pendientes: items.length - hechas };
}
