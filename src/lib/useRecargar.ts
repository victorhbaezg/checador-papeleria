import { useEffect, useRef } from "react";

// Hook que vuelve a ejecutar `recargar` cuando la app regresa a primer plano
// (cambiaste de pestana/app y volviste) o cuando vuelve la conexion a internet.
// Esto evita que, tras dejar el celular un rato, los datos queden viejos o que
// una consulta colgada deje la pantalla en blanco hasta recargar a mano.
export function useRecargarAlVolver(recargar: () => void, activo = true) {
  // Guardamos la ultima version de la funcion sin re-suscribir los listeners.
  const ref = useRef(recargar);
  ref.current = recargar;

  useEffect(() => {
    if (!activo) return;

    const alVolver = () => {
      if (document.visibilityState === "visible") ref.current();
    };
    const alReconectar = () => ref.current();

    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", alReconectar);

    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", alReconectar);
    };
  }, [activo]);
}
