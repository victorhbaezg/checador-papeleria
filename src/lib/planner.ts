/**
 * Helpers para la vista de planner/calendario de tareas.
 *
 * Trabajan sobre fechas calendario en formato "YYYY-MM-DD" (sin zona horaria)
 * para que el calendario sea estable sin importar el dispositivo. El estado
 * "hecha" se resuelve igual que en lib/tareas.ts: existe un renglon en
 * tareas_completadas con la clave de periodo correspondiente.
 */

import { supabase, type Tarea } from "./supabase";

// --- Fechas calendario (cadenas "YYYY-MM-DD") -----------------------------

/** Parsea "YYYY-MM-DD" a Date en UTC mediodia (evita corrimientos por zona). */
function aDate(fecha: string): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/** "YYYY-MM-DD" a partir de los componentes UTC de un Date. */
function aTexto(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Dia de la semana de una fecha: 0=domingo .. 6=sabado. */
export function diaSemanaDe(fecha: string): number {
  return aDate(fecha).getUTCDay();
}

/** Suma (o resta, con n negativo) dias a una fecha "YYYY-MM-DD". */
export function sumarDias(fecha: string, n: number): string {
  const d = aDate(fecha);
  d.setUTCDate(d.getUTCDate() + n);
  return aTexto(d);
}

/** Lunes de la semana que contiene a `fecha`. */
export function lunesDe(fecha: string): string {
  const dow = diaSemanaDe(fecha); // 0=dom..6=sab
  const atras = dow === 0 ? 6 : dow - 1;
  return sumarDias(fecha, -atras);
}

/** Los 7 dias (lunes..domingo) de la semana de `fecha`. */
export function semanaDe(fecha: string): string[] {
  const lunes = lunesDe(fecha);
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
}

/** Primer dia del mes de `fecha`. */
export function inicioMes(fecha: string): string {
  return fecha.slice(0, 8) + "01";
}

/** Numero de dias del mes de `fecha`. */
export function diasEnMes(fecha: string): number {
  const [y, m] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Suma `n` meses al primer dia del mes de `fecha`. */
export function sumarMeses(fecha: string, n: number): string {
  const [y, m] = fecha.split("-").map(Number);
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

// --- Reglas de aplicacion / periodo ---------------------------------------

/** Clave de periodo de una tarea para una fecha (igual que clavePeriodo). */
export function periodoDe(t: Tarea, fecha: string): string {
  return t.frecuencia === "semanal" ? lunesDe(fecha) : fecha;
}

/**
 * Indica si una tarea DIARIA aplica en una fecha del calendario.
 * - sin dias_semana = todos los dias.
 * - con dias_semana = solo esos dias.
 * (Las semanales se muestran aparte, no por dia.)
 */
export function diariaAplica(t: Tarea, fecha: string): boolean {
  if (t.frecuencia !== "diaria") return false;
  // Tarea de una vez: solo aplica en su fecha exacta.
  if (t.fecha) return t.fecha === fecha;
  if (!t.dias_semana || t.dias_semana.length === 0) return true;
  return t.dias_semana.includes(diaSemanaDe(fecha));
}

/**
 * Indica si una tarea SEMANAL aplica en la semana que contiene `fecha`.
 * - de una vez (con fecha) = solo la semana de esa fecha.
 * - recurrente = todas las semanas.
 */
export function semanalAplica(t: Tarea, fecha: string): boolean {
  if (t.frecuencia !== "semanal") return false;
  if (t.fecha) return lunesDe(t.fecha) === lunesDe(fecha);
  return true;
}

// --- Carga de completadas por rango ---------------------------------------

/**
 * Devuelve un Set con claves `${tarea_id}|${periodo}` de las tareas que el
 * trabajador marco como hechas dentro de los periodos indicados.
 */
export async function cargarCompletadas(
  trabajadorId: string,
  periodos: string[],
): Promise<Set<string>> {
  const unicos = Array.from(new Set(periodos));
  if (unicos.length === 0) return new Set();
  const { data } = await supabase
    .from("tareas_completadas")
    .select("tarea_id, periodo")
    .eq("trabajador_id", trabajadorId)
    .in("periodo", unicos);
  return new Set(
    (data ?? []).map(
      (c: { tarea_id: string; periodo: string }) => `${c.tarea_id}|${c.periodo}`,
    ),
  );
}

/** Todas las tareas activas de todos los trabajadores (solo admin via RLS). */
export async function cargarTareasActivasTodos(): Promise<Tarea[]> {
  const { data } = await supabase
    .from("tareas")
    .select("*")
    .eq("activo", true)
    .order("orden", { ascending: true })
    .order("creado_en", { ascending: true });
  return (data ?? []) as Tarea[];
}

/**
 * Completadas de TODOS los trabajadores en los periodos dados.
 * La clave del Set es `${tarea_id}|${periodo}` (tarea_id ya es unico).
 */
export async function cargarCompletadasTodos(
  periodos: string[],
): Promise<Set<string>> {
  const unicos = Array.from(new Set(periodos));
  if (unicos.length === 0) return new Set();
  const { data } = await supabase
    .from("tareas_completadas")
    .select("tarea_id, periodo")
    .in("periodo", unicos);
  return new Set(
    (data ?? []).map(
      (c: { tarea_id: string; periodo: string }) => `${c.tarea_id}|${c.periodo}`,
    ),
  );
}
