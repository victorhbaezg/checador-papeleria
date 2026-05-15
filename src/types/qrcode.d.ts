// Fallback de tipos para la librería `qrcode`.
// Cuando `@types/qrcode` esté instalado (en Vercel ya está vía package.json),
// los tipos oficiales tienen prioridad. Este archivo solo evita errores de
// typecheck si npm install todavía no se ha corrido localmente.

declare module "qrcode" {
  export type QRCodeErrorCorrectionLevel = "L" | "M" | "Q" | "H";

  export interface QRCodeToDataURLOptions {
    errorCorrectionLevel?: QRCodeErrorCorrectionLevel;
    margin?: number;
    scale?: number;
    width?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  }

  export function toDataURL(
    text: string,
    options?: QRCodeToDataURLOptions,
  ): Promise<string>;

  export function toCanvas(
    canvas: HTMLCanvasElement,
    text: string,
    options?: QRCodeToDataURLOptions,
  ): Promise<void>;

  const _default: {
    toDataURL: typeof toDataURL;
    toCanvas: typeof toCanvas;
  };
  export default _default;
}
