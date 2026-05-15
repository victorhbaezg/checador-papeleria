// Días de la semana en orden de presentación (lunes primero).
// El número guardado en BD sigue el estándar 0=domingo, 6=sábado.
export const DIAS_SEMANA: { numero: number; corto: string; largo: string }[] = [
  { numero: 1, corto: "Lun", largo: "Lunes" },
  { numero: 2, corto: "Mar", largo: "Martes" },
  { numero: 3, corto: "Mié", largo: "Miércoles" },
  { numero: 4, corto: "Jue", largo: "Jueves" },
  { numero: 5, corto: "Vie", largo: "Viernes" },
  { numero: 6, corto: "Sáb", largo: "Sábado" },
  { numero: 0, corto: "Dom", largo: "Domingo" },
];

/** Convierte "08:00:00" → "08:00" para inputs <input type="time"> */
export function hhmm(time: string): string {
  return time?.slice(0, 5) ?? "";
}

/** Formatea un número como moneda mexicana */
export function pesos(n: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(n);
}
