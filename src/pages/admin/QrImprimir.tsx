import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "../../lib/supabase";

/**
 * Hoja A4 lista para imprimir.
 * - En pantalla se ve centrada y bonita.
 * - Al imprimir (Ctrl+P / Cmd+P) se eliminan los botones y queda solo el contenido.
 */
export default function QrImprimir() {
  const [codigo, setCodigo] = useState<string>("");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cargar = async () => {
      const { data, error } = await supabase
        .from("configuracion")
        .select("qr_local")
        .eq("id", 1)
        .single();
      if (error || !data) {
        setError(error?.message ?? "No se encontro la configuracion");
        return;
      }
      setCodigo(data.qr_local);
      try {
        const url = await QRCode.toDataURL(data.qr_local, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 800,
          color: { dark: "#0f172a", light: "#ffffff" },
        });
        setQrDataUrl(url);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    cargar();
  }, []);

  return (
    <div className="min-h-screen bg-slate-200 print:bg-white">
      {/* Estilos especificos de impresion */}
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          html, body { background: white !important; }
          .no-print { display: none !important; }
          .hoja {
            box-shadow: none !important;
            margin: 0 !important;
            border-radius: 0 !important;
            min-height: 100vh !important;
          }
        }
      `}</style>

      {/* Barra superior (no se imprime) */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between bg-white px-4 py-3 shadow-sm">
        <button
          type="button"
          onClick={() => window.close()}
          className="flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
          Cerrar
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!qrDataUrl}
          className="btn-primary gap-1.5 px-4 py-2 text-sm"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9V2h12v7" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect width="12" height="8" x="6" y="14" />
          </svg>
          Imprimir
        </button>
      </div>

      {/* Hoja A4 (210 x 297 mm aproximadamente) */}
      <div className="mx-auto my-6 flex max-w-[210mm] flex-col items-center justify-center bg-white p-12 shadow-lg hoja">
        {error && (
          <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">{error}</p>
        )}

        {!error && (
          <>
            <p className="text-sm uppercase tracking-[0.3em] text-marca-600">
              Control de asistencia
            </p>
            <h1 className="mt-2 text-5xl font-black text-navy-700">CYBER 7</h1>

            <div className="mt-10 w-full border-y-4 border-double border-slate-300 py-10">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Codigo QR del local"
                  className="mx-auto h-72 w-72"
                />
              ) : (
                <div className="mx-auto flex h-72 w-72 items-center justify-center text-sm text-slate-400">
                  Generando...
                </div>
              )}
            </div>

            <h2 className="mt-10 text-2xl font-bold text-slate-900">
              Escanea para registrar tu asistencia
            </h2>
            <ol className="mt-4 max-w-md list-decimal space-y-1 text-left text-base text-slate-700">
              <li>Abre la app Control Cyber 7 en tu celular.</li>
              <li>Toca el boton "Marcar entrada / salida".</li>
              <li>Apunta la camara a este codigo.</li>
              <li>Listo: queda registrada tu hora.</li>
            </ol>

            <p className="mt-12 text-xs text-slate-400">
              Generado: {new Date().toLocaleDateString("es-MX", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
              {" - "}
              Codigo: <span className="font-mono">{codigo.slice(-8)}</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
