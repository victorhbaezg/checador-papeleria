import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { supabase, type Configuracion } from "../../lib/supabase";

/** Genera un código aleatorio corto pero único para el QR */
function generarCodigoQR(): string {
  // crypto.randomUUID() está disponible en navegadores modernos
  const id = crypto.randomUUID().replace(/-/g, "");
  return `CYBER7-${id.substring(0, 16).toUpperCase()}`;
}

export default function ConfiguracionPage() {
  const [config, setConfig] = useState<Configuracion | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  // Form de configuración general
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
      "Generar un nuevo código DESACTIVA el QR que ya esté pegado en la pared.\n\n" +
        "Tendrás que imprimir el nuevo y reemplazarlo. ¿Continuar?",
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
      setMensaje({ tipo: "error", texto: `No se guardó: ${error.message}` });
      return;
    }
    setMensaje({ tipo: "ok", texto: "Código nuevo generado. Imprime y reemplaza el QR de la pared." });
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
      setMensaje({ tipo: "error", texto: "El monto del bono debe ser un número válido" });
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
      setMensaje({ tipo: "error", texto: `No se guardó: ${error.message}` });
      return;
    }
    setMensaje({ tipo: "ok", texto: "Configuración guardada" });
    cargar();
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
          <Link to="/admin" className="text-xs text-slate-500 hover:text-slate-900">
            ← Panel admin
          </Link>
          <p className="text-base font-semibold text-slate-900">Configuración</p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        {mensaje && (
          <div
            className={`card border-l-4 text-sm ${
              mensaje.tipo === "error"
                ? "border-red-500 bg-red-50 text-red-700"
                : "border-emerald-500 bg-emerald-50 text-emerald-700"
            }`}
          >
            {mensaje.texto}
          </div>
        )}

        {/* QR del local */}
        <section className="card space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">QR del local</h2>
            <p className="text-xs text-slate-500">
              Imprime este QR y pégalo a la entrada de la papelería. Los trabajadores lo
              escanean al marcar entrada y salida para confirmar que están físicamente en
              el local.
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-start">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Código QR del local"
                className="h-44 w-44 rounded-lg border border-slate-200 bg-white p-2"
              />
            ) : (
              <div className="flex h-44 w-44 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400">
                Generando…
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-xs text-slate-500">Código actual:</p>
              <code className="block break-all rounded-md bg-white px-2 py-1 text-xs text-slate-700 ring-1 ring-slate-200">
                {config?.qr_local}
              </code>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={descargarPNG}
                  disabled={!qrDataUrl}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  ⬇ PNG
                </button>
                <Link
                  to="/admin/configuracion/imprimir"
                  target="_blank"
                  rel="noopener"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  🖨 Hoja imprimible
                </Link>
                <button
                  type="button"
                  onClick={regenerarQR}
                  disabled={regenerando}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  {regenerando ? "Generando…" : "↻ Generar nuevo"}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Configuración general */}
        <form onSubmit={guardarConfig} className="card space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">Configuración general</h2>
            <p className="text-xs text-slate-500">
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
              Si llega después de su hora de entrada + esta tolerancia, cuenta como retardo.
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
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
