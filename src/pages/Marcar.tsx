import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { useAuth } from "../lib/auth";
import { supabase, type Configuracion, type Horario, type Marca } from "../lib/supabase";
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
  // Bandera para que no se procese el mismo escaneo dos veces seguidas
  const procesandoRef = useRef(false);

  // Arranca el escáner cuando montamos la pantalla
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
        // onScanFailure: silencioso, dispara muchísimo
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
          mensaje: `No se pudo abrir la cámara: ${msg}`,
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
      // ignorar — puede pasar si nunca arrancó del todo
    }
    scannerRef.current = null;
  };

  const procesarEscaneo = async (codigoEscaneado: string) => {
    if (!trabajador) return;
    setEstado({ kind: "procesando" });

    try {
      // 1) Traer configuración para validar el QR
      const { data: configData, error: errConfig } = await supabase
        .from("configuracion")
        .select("*")
        .eq("id", 1)
        .single();
      if (errConfig || !configData) {
        throw new Error(errConfig?.message ?? "No se pudo leer la configuración.");
      }
      const config = configData as Configuracion;
      const qrValido = codigoEscaneado.trim() === config.qr_local.trim();

      if (!qrValido) {
        // El QR es de otra cosa (no del local). Avisamos y dejamos volver a intentar.
        setEstado({
          kind: "error",
          mensaje: "Ese código no es el del local. Pídele a Hugo el QR correcto.",
        });
        procesandoRef.current = false;
        return;
      }

      // 2) Traer marcas de hoy del trabajador para decidir entrada/salida
      const hoyMx = fechaHoyMx(); // YYYY-MM-DD en CDMX
      // Rango UTC: 00:00 CDMX = 06:00 UTC; +24h
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

      // 3) Si es entrada, verificar si hay retardo (silencioso para el trabajador)
      const ahora = new Date();
      let fueRetardo = false;
      if (tipo === "entrada") {
        const dia = diaSemanaMx(ahora);
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

      // 4) Insertar la marca. Decisión: el retardo se guarda en silencio en
      //    `nota` para que Hugo lo vea en los reportes; el trabajador NO se
      //    entera al momento de marcar.
      const nota = tipo === "entrada" && fueRetardo ? "retardo" : null;
      const { error: errInsert } = await supabase.from("marcas").insert({
        trabajador_id: trabajador.id,
        tipo,
        marcado_en: ahora.toISOString(),
        qr_codigo_escaneado: codigoEscaneado,
        qr_valido: true,
        nota,
        // lat / lng se quedan en NULL — geolocalización se implementará después
      });
      if (errInsert) throw new Error(errInsert.message);

      // 5) Apagar cámara y mostrar éxito
      await detenerScanner();
      setEstado({ kind: "exito", tipo, hora: ahora.toISOString() });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      setEstado({ kind: "error", mensaje });
      procesandoRef.current = false;
    }
  };

  // -------- Vistas --------

  if (!trabajador) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <Link to="/" className="text-sm text-slate-500 hover:text-slate-900">
            ← Atrás
          </Link>
          <p className="text-base font-semibold text-slate-900">Marcar</p>
          <span className="w-12" />
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-6 space-y-4">
        {estado.kind === "exito" ? (
          <PantallaExito
            tipo={estado.tipo}
            hora={estado.hora}
            onIrAHome={() => navigate("/")}
          />
        ) : (
          <>
            <div className="card">
              <p className="mb-1 text-sm font-semibold text-slate-900">
                Apunta tu cámara al QR del local
              </p>
              <p className="text-xs text-slate-500">
                {estado.kind === "preparando" && "Preparando la cámara…"}
                {estado.kind === "esperando_scan" &&
                  "La app detecta automáticamente entrada o salida según la hora del día."}
                {estado.kind === "procesando" && "Procesando marca…"}
                {estado.kind === "error" && "Hubo un problema. Lee el aviso abajo."}
              </p>
            </div>

            {/* Contenedor donde html5-qrcode pinta el video */}
            <div
              id={QR_ELEMENT_ID}
              className="overflow-hidden rounded-2xl bg-black"
              style={{ minHeight: 280 }}
            />

            {estado.kind === "error" && (
              <div className="card border border-rose-200 bg-rose-50 text-sm text-rose-700">
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
      <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">
        ✓
      </div>
      <p className="text-xs uppercase tracking-wide text-slate-500">
        {tipo === "entrada" ? "Entrada registrada" : "Salida registrada"}
      </p>
      <p className="mt-1 text-3xl font-bold text-slate-900">{formatoHoraMx(hora)}</p>
      <p className="mt-1 text-sm text-slate-500">{fechaLarga}</p>

      <button onClick={onIrAHome} className="btn-primary mt-6 w-full">
        Listo
      </button>
    </div>
  );
}
