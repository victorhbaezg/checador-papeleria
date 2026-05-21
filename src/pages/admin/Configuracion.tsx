import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { supabase, type Configuracion } from "../../lib/supabase";

/** Genera un codigo aleatorio corto pero unico para el QR */
function generarCodigoQR(): string {
  // crypto.randomUUID() esta disponible en navegadores modernos
  const id = crypto.randomUUID().replace(/-/g, "");
  return `CYBER7-${id.substring(0, 16).toUpperCase()}`;
}

export default function ConfiguracionPage() {
  const [config, setConfig] = useState<Configuracion | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  // Form de configuracion general
  const [tolerancia, setTolerancia] = useState("");
  const [bono, setBono] = useState("");

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const cargar = async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("configuracion")
      .select("*")
      .eq("id", 1)
      .single();
    if (error) {
      setMensaje({ tipo: "error", texto: error.message });
      setCargando(false);
      return;
    }
    const c = data as Configuracion;
    setConfig(c);
    setTolerancia(String(c.tolerancia_retardo_minutos));
    setBono(String(c.monto_bono_mensual));
    setCargando(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  // Cuando cambia el qr_local, regenerar la imagen del QR
  useEffect(() => {
    if (!config?.qr_local) return;
    QRCode.toDataURL(config.qr_local, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 400,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch((err) => {
        setMensaje({ tipo: "error", texto: `No se pudo generar el QR: ${err.message}` });
      });
  }, [config?.qr_local]);

  const regenerarQR = async () => {
    const confirmar = window.confirm(
      "Generar un nuevo codigo DESACTIVA el QR que ya este pegado en la pared.\n\n" +
        "Tendras que imprimir el nuevo y reemplazarlo. Continuar?",
    );
    if (!confirmar) return;

    setRegenerando(true);
    setMensaje(null);
    const nuevoCodigo = generarCodigoQR();
    const { error } = await supabase
      .from("configuracion")
      .update({ qr_local: nuevoCodigo, actualizado_en: new Date().toISOString() })
      .eq("id", 1);
    setRegenerando(false);

    if (error) {
      setMensaje({ tipo: "error", texto: `No se guardo: ${error.message}` });
      return;
    }
    setMensaje({ tipo: "ok", texto: "Codigo nuevo generado. Imprime y reemplaza el QR de la pared." });
    cargar();
  };

  const descargarPNG = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `qr-cyber7-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const guardarConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje(null);

    const tolNum = parseInt(tolerancia, 10);
    const bonoNum = parseFloat(bono);

    if (!Number.isFinite(tolNum) || tolNum < 0 || tolNum > 60) {
      setMensaje({ tipo: "error", texto: "La tolerancia debe estar entre 0 y 60 minutos" });
      return;
    }
    if (!Number.isFinite(bonoNum) || bonoNum < 0) {
      setMensaje({ tipo: "error", texto: "El monto del bono debe ser un numero valido" });
      return;
    }

    setGuardando(true);
    const { error } = await supabase
      .from("configuracion")
      .update({
        tolerancia_retardo_minutos: tolNum,
        monto_bono_mensual: bonoNum,
        actualizado_en: new Date().toISOString(),
      })
      .eq("id", 1);
    setGuardando(false);

    if (error) {
      setMensaje({ tipo: "error", texto: `No se guardo: ${error.message}` });
      return;
    }
    setMensaje({ tipo: "ok", texto: "Configuracion guardada" });
    cargar();
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
            to="/admin"
            className="flex items-center gap-1 text-[11px] font-medium text-navy-200 transition hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            Panel admin
          </Link>
          <p className="text-sm font-semibold text-white">Configuracion</p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        {mensaje && (
          <div
            className={`rounded-lg p-4 text-sm ring-1 ${
              mensaje.tipo === "error"
                ? "bg-rose-50 text-rose-700 ring-rose-200"
                : "bg-emerald-50 text-emerald-700 ring-emerald-200"
            }`}
          >
            {mensaje.texto}
          </div>
        )}

        {/* QR del local */}
        <section className="card space-y-4">
          <div>
            <h2 className="label-section">QR del local</h2>
            <p className="mt-1 text-xs text-slate-500">
              Imprime este QR y pegalo a la entrada de la papeleria. Los trabajadores lo
              escanean al marcar entrada y salida para confirmar que estan fisicamente en
              el local.
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 rounded-lg bg-slate-50 p-4 sm:flex-row sm:items-start">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Codigo QR del local"
                className="h-44 w-44 rounded-lg border border-slate-200 bg-white p-2"
              />
            ) : (
              <div className="flex h-44 w-44 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400">
                Generando...
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-xs text-slate-500">Codigo actual:</p>
              <code className="block break-all rounded-md bg-white px-2 py-1 text-xs text-slate-700 ring-1 ring-slate-200">
                {config?.qr_local}
              </code>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={descargarPNG}
                  disabled={!qrDataUrl}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <path d="M7 10l5 5 5-5" />
                    <path d="M12 15V3" />
                  </svg>
                  PNG
                </button>
                <Link
                  to="/admin/configuracion/imprimir"
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9V2h12v7" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect width="12" height="8" x="6" y="14" />
                  </svg>
                  Hoja imprimible
                </Link>
                <button
                  type="button"
                  onClick={regenerarQR}
                  disabled={regenerando}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                    <path d="M8 16H3v5" />
                  </svg>
                  {regenerando ? "Generando..." : "Generar nuevo"}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Configuracion general */}
        <form onSubmit={guardarConfig} className="card space-y-4">
          <div>
            <h2 className="label-section">Configuracion general</h2>
            <p className="mt-1 text-xs text-slate-500">
              Reglas que afectan a todos los trabajadores.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Tolerancia de retardo (minutos)
            </label>
            <input
              type="number"
              min="0"
              max="60"
              step="1"
              value={tolerancia}
              onChange={(e) => setTolerancia(e.target.value)}
              className="input-field"
              required
            />
            <p className="mt-1 text-xs text-slate-400">
              Si llega despues de su hora de entrada + esta tolerancia, cuenta como retardo.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Monto del bono mensual (MXN)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={bono}
              onChange={(e) => setBono(e.target.value)}
              className="input-field"
              required
            />
            <p className="mt-1 text-xs text-slate-400">
              Se paga si el trabajador no tuvo ninguna falta ni retardo en el mes.
            </p>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={guardando} className="btn-primary">
              {guardando ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
