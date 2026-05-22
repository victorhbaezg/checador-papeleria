import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { useAuth } from "../lib/auth";
import { supabase, type Configuracion, type Horario, type HorarioExcepcion, type Marca } from "../lib/supabase";
import {
  diaSemanaMx,
  esRetardo,
  fechaHoyMx,
  formatoHoraMx,
  siguienteTipo,
  ZONA_HORARIA,
} from "../lib/marcado";

type Estado =
  | { kind: "preparando" }
  | { kind: "esperando_scan" }
  | { kind: "procesando" }
  | { kind: "exito"; tipo: "entrada" | "salida"; hora: string }
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

      const tipo = siguienteTipo((marcasHoyData ?? []) as Marca[]);

      // 3) Si es entrada, verificar retardo considerando excepciones de horario
      const ahora = new Date();
      let fueRetardo = false;
      if (tipo === "entrada") {
        const dia = diaSemanaMx(ahora);

        // Consultar si existe excepcion de horario para hoy
        const { data: excepcionData } = await supabase
          .from("horario_excepciones")
          .select("*")
          .eq("trabajador_id", trabajador.id)
          .eq("fecha", hoyMx)
          .maybeSingle();

        const excepcion = excepcionData as HorarioExcepcion | null;

        if (excepcion && excepcion.es_dia_libre) {
          // Dia libre por excepcion: no hay retardo posible
          fueRetardo = false;
        } else if (excepcion && excepcion.hora_entrada_esperada) {
          // Horario especial: construimos un Horario virtual con las horas de la excepcion
          const horarioVirtual: Horario = {
            id: "",
            trabajador_id: trabajador.id,
            dia_semana: dia,
            hora_entrada_esperada: excepcion.hora_entrada_esperada,
            hora_salida_esperada: excepcion.hora_salida_esperada ?? "00:00:00",
            descansa: false,
          };
          fueRetardo = esRetardo(ahora, horarioVirtual, config.tolerancia_retardo_minutos);
        } else {
          // Sin excepcion: usar el horario regular del dia
          const { data: horarioData } = await supabase
            .from("horarios")
            .select("*")
            .eq("trabajador_id", trabajador.id)
            .eq("dia_semana", dia)
            .maybeSingle();
          fueRetardo = esRetardo(
            ahora,
            (horarioData as Horario | null) ?? null,
            config.tolerancia_retardo_minutos,
          );
        }
      }

      // 4) Insertar la marca
      const nota = tipo === "entrada" && fueRetardo ? "retardo" : null;
      const { error: errInsert } = await supabase.from("marcas").insert({
        trabajador_id: trabajador.id,
        tipo,
        marcado_en: ahora.toISOString(),
        qr_codigo_escaneado: codigoEscaneado,
        qr_valido: true,
        nota,
      });
      if (errInsert) throw new Error(errInsert.message);

      // 5) Apagar camara y mostrar exito
      await detenerScanner();
      setEstado({ kind: "exito", tipo, hora: ahora.toISOString() });
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
                  "La app detecta automaticamente entrada o salida segun la hora del dia."}
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

function PantallaExito({
  tipo,
  hora,
  onIrAHome,
}: {
  tipo: "entrada" | "salida";
  hora: string;
  onIrAHome: () => void;
}) {
  const fechaLarga = new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA_HORARIA,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(hora));

  return (
    <div className="card text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-200">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <p className="label-section">
        {tipo === "entrada" ? "Entrada registrada" : "Salida registrada"}
      </p>
      <p className="mt-1 text-3xl font-bold text-navy-700">{formatoHoraMx(hora)}</p>
      <p className="mt-1 text-sm capitalize text-slate-500">{fechaLarga}</p>

      <button onClick={onIrAHome} className="btn-primary mt-6 w-full">
        Listo
      </button>
    </div>
  );
}
