/**
 * Helpers para el flujo de marcado de entrada/salida.
 *
 * Las funciones aquí son puras (no tocan Supabase) para que sean
 * fáciles de razonar y de probar a mano si hace falta.
 */

import type { Horario, Marca, TipoMarca } from "./supabase";

export const ZONA_HORARIA = "America/Mexico_City";

/**
 * Devuelve la fecha (YYYY-MM-DD) de "ahora" en la zona horaria de México,
 * sin depender de la zona del dispositivo (por si alguien tiene el celular
 * en otra zona).
 */
export function fechaHoyMx(ahora: Date = new Date()): string {
  // "es-MX" + timeZone fija la fecha en CDMX. Sale como "16/05/2026" → invertimos.
  const partes = new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ahora);
  const dd = partes.find((p) => p.type === "day")!.value;
  const mm = partes.find((p) => p.type === "month")!.value;
  const yyyy = partes.find((p) => p.type === "year")!.value;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Día de la semana en zona México: 0=domingo, 6=sábado.
 * Coincide con la convención de la tabla `horarios.dia_semana`.
 */
export function diaSemanaMx(ahora: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_HORARIA,
    weekday: "short",
  }).format(ahora);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[fmt] ?? 0;
}

/**
 * Decide si la siguiente marca debe ser "entrada" o "salida".
 *
 * Regla: si hoy ya hay una entrada SIN salida, la siguiente es salida.
 * Si no, es entrada.
 *
 * Espera recibir solo las marcas del día de hoy del trabajador.
 */
export function siguienteTipo(marcasDeHoy: Marca[]): "entrada" | "salida" {
  const hayEntrada = marcasDeHoy.some((m) => m.tipo === "entrada");
  const haySalida = marcasDeHoy.some((m) => m.tipo === "salida");
  if (hayEntrada && !haySalida) return "salida";
  return "entrada";
}

/**
 * Minutos transcurridos desde medianoche segun el reloj de pared en CDMX.
 * Ej: las 16:30 en CDMX devuelve 990 sin importar la zona del dispositivo.
 */
export function minutosPared(d: Date): number {
  const horaPared = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA_HORARIA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  const [h, m] = horaPared.split(":").map(Number);
  return h * 60 + m;
}

/** Convierte "16:30:00" (o "16:30") a minutos desde medianoche. */
function horaTextoAMin(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

/** ¿El horario de este dia tiene una pausa programada (entrada y salida)? */
export function tienePausaProgramada(h: Horario | null | undefined): boolean {
  return Boolean(h && !h.descansa && h.hora_pausa_inicio && h.hora_pausa_fin);
}

// Margen (min) antes de la hora de salida del dia para seguir interpretando
// un escaneo de salida como "inicio de pausa" en vez de "salida final".
const MARGEN_PAUSA_MIN = 45;

/**
 * Decide cual es la siguiente marca a registrar considerando la pausa
 * programada del trabajador.
 *
 * Estados posibles a partir de las marcas del dia:
 *  - sin entrada            -> "entrada"
 *  - pausa abierta          -> "pausa_fin" (regreso)
 *  - trabajando, pausa
 *    programada y no tomada
 *    y aun lejos del cierre  -> "pausa_inicio"
 *  - trabajando             -> "salida"
 *  - dia ya cerrado         -> "entrada" (nueva jornada, caso raro)
 *
 * `horarioDelDia` es el renglon regular de `horarios` (de el sale la pausa).
 */
export function siguienteAccion(
  marcasDeHoy: Marca[],
  horarioDelDia: Horario | null | undefined,
  ahora: Date = new Date(),
): TipoMarca {
  const hayEntrada = marcasDeHoy.some((m) => m.tipo === "entrada");
  if (!hayEntrada) return "entrada";

  const hayPausaInicio = marcasDeHoy.some((m) => m.tipo === "pausa_inicio");
  const hayPausaFin = marcasDeHoy.some((m) => m.tipo === "pausa_fin");
  if (hayPausaInicio && !hayPausaFin) return "pausa_fin";

  const haySalida = marcasDeHoy.some((m) => m.tipo === "salida");
  if (haySalida) return "entrada"; // dia ya cerrado; arranca una nueva jornada

  // Trabajando, sin salida y sin pausa abierta.
  // Si tiene pausa programada y aun no la toma, y todavia falta bastante
  // para su hora de salida, interpretamos este escaneo como inicio de pausa.
  if (tienePausaProgramada(horarioDelDia) && !hayPausaInicio) {
    const minSalida = horaTextoAMin(horarioDelDia!.hora_salida_esperada);
    if (minutosPared(ahora) <= minSalida - MARGEN_PAUSA_MIN) {
      return "pausa_inicio";
    }
  }
  return "salida";
}

/**
 * Clave del periodo de una tarea para guardar/consultar si esta hecha.
 * - diaria  -> la fecha de hoy en CDMX ("YYYY-MM-DD")
 * - semanal -> el lunes de la semana actual en CDMX ("YYYY-MM-DD")
 */
export function clavePeriodo(
  frecuencia: "diaria" | "semanal",
  ahora: Date = new Date(),
): string {
  if (frecuencia === "semanal") {
    const lunesUtc = inicioSemanaMx(ahora);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONA_HORARIA,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(lunesUtc);
  }
  return fechaHoyMx(ahora);
}

/**
 * Determina si una entrada cuenta como retardo.
 *
 * - `horarioDelDia` es el renglón de `horarios` para el trabajador y el
 *   día correspondiente. Si descansa o no existe, no hay retardo posible.
 * - `toleranciaMin` viene de `configuracion.tolerancia_retardo_minutos`.
 *
 * Compara la hora del reloj de pared en CDMX (no UTC) contra la hora
 * esperada de entrada.
 */
export function esRetardo(
  marcadoEn: Date,
  horarioDelDia: Horario | null | undefined,
  toleranciaMin: number,
): boolean {
  if (!horarioDelDia || horarioDelDia.descansa) return false;

  const horaPared = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA_HORARIA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(marcadoEn);
  // horaPared ej: "08:07"
  const [hM, mM] = horaPared.split(":").map(Number);
  const minutosMarcado = hM * 60 + mM;

  // horarioDelDia.hora_entrada_esperada viene como "08:00:00"
  const [hE, mE] = horarioDelDia.hora_entrada_esperada.split(":").map(Number);
  const minutosEsperados = hE * 60 + mE;

  return minutosMarcado > minutosEsperados + toleranciaMin;
}

/**
 * Inicio del lunes de la semana actual (00:00 CDMX) como Date en UTC.
 * Útil para consultar marcas de la semana en curso.
 *
 * Convención: la semana empieza en lunes. (Aunque el día de pago es el
 * viernes, mostramos la semana lun-dom para que cuadre con la intuición
 * de los trabajadores.)
 */
export function inicioSemanaMx(ahora: Date = new Date()): Date {
  const dia = diaSemanaMx(ahora); // 0=dom..6=sab
  // Cuántos días retroceder para llegar al lunes:
  // dom(0)→6, lun(1)→0, mar(2)→1, ..., sab(6)→5
  const diasAtras = dia === 0 ? 6 : dia - 1;

  const hoyStr = fechaHoyMx(ahora); // YYYY-MM-DD en CDMX
  // CDMX en mayo está en UTC-6 (sin DST desde 2022). Para evitar líos de
  // DST construimos el Date a partir de medianoche local y restamos días.
  const [yyyy, mm, dd] = hoyStr.split("-").map(Number);
  // 06:00 UTC = 00:00 CDMX (UTC-6, sin horario de verano)
  const inicioHoyUtc = new Date(Date.UTC(yyyy, mm - 1, dd, 6, 0, 0));
  return new Date(inicioHoyUtc.getTime() - diasAtras * 24 * 60 * 60 * 1000);
}

/**
 * Formatea una hora ISO (UTC) en hh:mm CDMX, 24h.
 */
export function formatoHoraMx(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA_HORARIA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/**
 * Formatea una fecha ISO o YYYY-MM-DD como "lun 12 may".
 */
export function formatoFechaCorta(fecha: string | Date): string {
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA_HORARIA,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}
