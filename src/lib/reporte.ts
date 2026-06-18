/**
 * Logica pura para el reporte semanal de pago.
 *
 * Todas las funciones son puras (no tocan Supabase) para que sean
 * faciles de razonar y de probar.
 */

import type {
  FrecuenciaTarea,
  Horario,
  Marca,
  Tarea,
  TareaCompletada,
  TareaJustificada,
} from "./supabase";
import { clavePeriodo, diaSemanaMx, fechaHoyMx, inicioSemanaMx, ZONA_HORARIA } from "./marcado";
import { diaSemanaDe, lunesDe, sumarDias } from "./planner";

export const UMBRAL_SANCION_DEFAULT = 60;

export type ResumenSemana = {
  horasTrabajadas: number;
  retardos: number;
  faltas: number;
  // Sancion por retardos acumulados
  minutosTarde: number; // suma de minutos tarde (retardos sin justificar)
  horasDescontadas: number; // horas que se descuentan por la sancion
  montoDescuento: number; // $ descontado
  pagoBruto: number; // antes del descuento
  totalPago: number; // despues del descuento (lo que se paga)
};

export type DescuentoRetardos = {
  minutosTarde: number;
  horasDescontadas: number;
  monto: number;
};

/**
 * Calcula el descuento por retardos acumulados, agrupando por semana.
 *
 * Regla: dentro de cada semana se suman los minutos tarde de los retardos
 * sin justificar. Si esa suma llega al umbral (default 60 min), se descuenta
 * TODO ese tiempo. Si junta menos del umbral, no se descuenta nada esa semana.
 *
 * Agrupar por semana permite reutilizar esta funcion tanto en el reporte
 * semanal (una sola semana) como en el mensual (varias semanas).
 *
 * Si umbralMin <= 0, la sancion esta desactivada.
 */
export function descuentoRetardos(
  marcas: Marca[],
  tarifaHora: number,
  umbralMin: number = UMBRAL_SANCION_DEFAULT,
): DescuentoRetardos {
  const minutosPorSemana = new Map<string, number>();
  for (const m of marcas) {
    if (
      (m.tipo === "entrada" || m.tipo === "pausa_fin") &&
      m.nota === "retardo" &&
      !m.justificada &&
      m.minutos_tarde
    ) {
      const lunes = clavePeriodo("semanal", new Date(m.marcado_en));
      minutosPorSemana.set(lunes, (minutosPorSemana.get(lunes) ?? 0) + m.minutos_tarde);
    }
  }

  let minutosTarde = 0;
  let horasDescontadas = 0;
  for (const min of minutosPorSemana.values()) {
    minutosTarde += min;
    if (umbralMin > 0 && min >= umbralMin) {
      horasDescontadas += min / 60;
    }
  }

  return {
    minutosTarde,
    horasDescontadas,
    monto: horasDescontadas * tarifaHora,
  };
}

// ------------------------------------------------------------------
// Helpers internos
// ------------------------------------------------------------------

/** Convierte un timestamp ISO a "YYYY-MM-DD" en zona Mexico. */
function isoAFechaMx(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/**
 * Dado un dia_semana (0=dom, 1=lun ... 6=sab) y el inicio UTC del lunes
 * de la semana actual, devuelve la fecha "YYYY-MM-DD" en zona Mexico.
 */
function diaAFechaSemana(diaSemana: number, inicioLunesUtc: Date): string {
  const offset = diaSemana === 0 ? 6 : diaSemana - 1;
  const ts = inicioLunesUtc.getTime() + offset * 24 * 60 * 60 * 1000;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}

// ------------------------------------------------------------------
// Funcion principal
// ------------------------------------------------------------------

/**
 * Calcula el resumen semanal (lunes -> hoy) de un trabajador.
 */
export function calcularResumenSemana(
  marcas: Marca[],
  horarios: Horario[],
  tarifaHora: number,
  diasExcluidos: Set<string> = new Set(),
  ahora: Date = new Date(),
  umbralSancionMin: number = UMBRAL_SANCION_DEFAULT,
): ResumenSemana {
  const diaSemanaHoy = diaSemanaMx(ahora);

  const diasEnRango: number[] = [];
  if (diaSemanaHoy === 0) {
    for (let d = 1; d <= 6; d++) diasEnRango.push(d);
    diasEnRango.push(0);
  } else {
    for (let d = 1; d <= diaSemanaHoy; d++) diasEnRango.push(d);
  }

  const horariosLaborales = horarios.filter(
    (h) => diasEnRango.includes(h.dia_semana) && !h.descansa,
  );

  const inicioLunesUtc = inicioSemanaMx(ahora);

  const fechasConEntrada = new Set<string>();
  for (const m of marcas) {
    if (m.tipo === "entrada") {
      fechasConEntrada.add(isoAFechaMx(m.marcado_en));
    }
  }

  // Faltas = dias laborales sin entrada Y no excluidos
  const faltas = horariosLaborales.filter((h) => {
    const fecha = diaAFechaSemana(h.dia_semana, inicioLunesUtc);
    return !fechasConEntrada.has(fecha) && !diasExcluidos.has(fecha);
  }).length;

  const porDia = new Map<
    string,
    { entradas: Marca[]; salidas: Marca[]; minPausaTarde: number }
  >();
  for (const m of marcas) {
    const fecha = isoAFechaMx(m.marcado_en);
    if (!porDia.has(fecha))
      porDia.set(fecha, { entradas: [], salidas: [], minPausaTarde: 0 });
    if (m.tipo === "entrada") {
      porDia.get(fecha)!.entradas.push(m);
    } else if (m.tipo === "salida") {
      porDia.get(fecha)!.salidas.push(m);
    } else if (
      m.tipo === "pausa_fin" &&
      m.nota === "retardo" &&
      !m.justificada &&
      m.minutos_tarde
    ) {
      // Regreso tarde de la pausa: esos minutos no se cuentan como trabajados.
      porDia.get(fecha)!.minPausaTarde += m.minutos_tarde;
    }
    // pausa_inicio se ignora: la pausa puntual se paga normal.
  }

  let horasTrabajadas = 0;
  for (const { entradas, salidas, minPausaTarde } of porDia.values()) {
    if (entradas.length > 0 && salidas.length > 0) {
      const msEntrada = new Date(entradas[0].marcado_en).getTime();
      const msSalida = new Date(salidas[salidas.length - 1].marcado_en).getTime();
      const ms = msSalida - msEntrada;
      if (ms > 0) {
        horasTrabajadas += Math.max(0, ms / (1000 * 60 * 60) - minPausaTarde / 60);
      }
    }
  }

  // Retardos = entradas con nota='retardo' que NO esten justificadas
  const retardos = marcas.filter(
    (m) =>
      (m.tipo === "entrada" || m.tipo === "pausa_fin") &&
      m.nota === "retardo" &&
      !m.justificada,
  ).length;

  const desc = descuentoRetardos(marcas, tarifaHora, umbralSancionMin);
  const pagoBruto = horasTrabajadas * tarifaHora;

  return {
    horasTrabajadas,
    retardos,
    faltas,
    minutosTarde: desc.minutosTarde,
    horasDescontadas: desc.horasDescontadas,
    montoDescuento: desc.monto,
    pagoBruto,
    totalPago: Math.max(0, pagoBruto - desc.monto),
  };
}

// ==================================================================
// REPORTE MENSUAL
// ==================================================================

export type ResumenMes = {
  horasTrabajadas: number;
  retardos: number;
  faltas: number;
  totalSueldo: number; // bruto por horas
  minutosTarde: number;
  horasDescontadas: number;
  montoDescuento: number; // descuento por retardos acumulados (por semana)
  tareasIncompletas: number; // tareas del mes (cerradas) que no se completaron
  montoSancionTareas: number; // descuento $ por esas tareas no hechas
  bono: number;
  ganoBonoMes: boolean;
  totalConBono: number; // sueldo - descuento + bono
};

/**
 * Devuelve el Date UTC que corresponde al primer dia del mes en Mexico
 * a medianoche CDMX (= 06:00 UTC, ya que Mexico es UTC-6 fijo desde 2022).
 */
export function inicioMesMx(ahora: Date = new Date()): Date {
  const partes = new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(ahora);
  const yyyy = partes.find((p) => p.type === "year")!.value;
  const mm = partes.find((p) => p.type === "month")!.value;
  return new Date(`${yyyy}-${mm}-01T06:00:00.000Z`);
}

/** Convierte un Date UTC a "YYYY-MM-DD" en zona Mexico. */
function dateFechaMx(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Calcula el resumen mensual (dia 1 del mes -> hoy) de un trabajador.
 */
export function calcularResumenMes(
  marcas: Marca[],
  horarios: Horario[],
  tarifaHora: number,
  montoBono: number = 250,
  diasExcluidos: Set<string> = new Set(),
  ahora: Date = new Date(),
  umbralSancionMin: number = UMBRAL_SANCION_DEFAULT,
  tareas: Tarea[] = [],
  completadas: TareaCompletada[] = [],
  montoSancionTarea: number = 0,
  justificadas: TareaJustificada[] = [],
): ResumenMes {
  const hoyStr = dateFechaMx(ahora);

  const horarioPorDia = new Map<number, Horario>();
  for (const h of horarios) {
    if (!h.descansa) horarioPorDia.set(h.dia_semana, h);
  }

  const fechasConEntrada = new Set<string>();
  for (const m of marcas) {
    if (m.tipo === "entrada") {
      fechasConEntrada.add(isoAFechaMx(m.marcado_en));
    }
  }

  const inicio = inicioMesMx(ahora);
  let faltas = 0;
  let cursor = new Date(inicio.getTime());
  while (true) {
    const fechaStr = dateFechaMx(cursor);
    if (fechaStr > hoyStr) break;

    const diaSemana = new Intl.DateTimeFormat("en-US", {
      timeZone: ZONA_HORARIA,
      weekday: "short",
    }).format(cursor);
    const diaNum =
      { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[diaSemana] ?? 0;

    if (
      horarioPorDia.has(diaNum) &&
      !fechasConEntrada.has(fechaStr) &&
      !diasExcluidos.has(fechaStr)
    ) {
      faltas++;
    }

    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  const retardos = marcas.filter(
    (m) =>
      (m.tipo === "entrada" || m.tipo === "pausa_fin") &&
      m.nota === "retardo" &&
      !m.justificada,
  ).length;

  const porDia = new Map<
    string,
    { entradas: Marca[]; salidas: Marca[]; minPausaTarde: number }
  >();
  for (const m of marcas) {
    const fecha = isoAFechaMx(m.marcado_en);
    if (!porDia.has(fecha))
      porDia.set(fecha, { entradas: [], salidas: [], minPausaTarde: 0 });
    if (m.tipo === "entrada") porDia.get(fecha)!.entradas.push(m);
    else if (m.tipo === "salida") porDia.get(fecha)!.salidas.push(m);
    else if (
      m.tipo === "pausa_fin" &&
      m.nota === "retardo" &&
      !m.justificada &&
      m.minutos_tarde
    ) {
      // Regreso tarde de la pausa: esos minutos no se cuentan como trabajados.
      porDia.get(fecha)!.minPausaTarde += m.minutos_tarde;
    }
  }

  let horasTrabajadas = 0;
  for (const { entradas, salidas, minPausaTarde } of porDia.values()) {
    if (entradas.length > 0 && salidas.length > 0) {
      const ms =
        new Date(salidas[salidas.length - 1].marcado_en).getTime() -
        new Date(entradas[0].marcado_en).getTime();
      if (ms > 0) {
        horasTrabajadas += Math.max(0, ms / 3_600_000 - minPausaTarde / 60);
      }
    }
  }

  const tareasIncompletas = contarTareasIncompletas(
    tareas,
    completadas,
    justificadas,
    marcas,
    ahora,
  );
  const montoSancionTareas = tareasIncompletas * montoSancionTarea;
  const ganoBonoMes = faltas === 0 && retardos === 0 && tareasIncompletas === 0;
  const bono = ganoBonoMes ? montoBono : 0;
  const totalSueldo = horasTrabajadas * tarifaHora;

  // Descuento por retardos acumulados, calculado por semana dentro del mes.
  const desc = descuentoRetardos(marcas, tarifaHora, umbralSancionMin);

  return {
    horasTrabajadas,
    retardos,
    faltas,
    totalSueldo,
    minutosTarde: desc.minutosTarde,
    horasDescontadas: desc.horasDescontadas,
    montoDescuento: desc.monto,
    tareasIncompletas,
    montoSancionTareas,
    bono,
    ganoBonoMes,
    totalConBono: Math.max(0, totalSueldo - desc.monto - montoSancionTareas) + bono,
  };
}

// ==================================================================
// TAREAS INCOMPLETAS (afectan el bono mensual)
// ==================================================================

/** Una tarea diaria aplica en una fecha concreta ("YYYY-MM-DD" calendario). */
function tareaDiariaAplicaEnFecha(t: Tarea, fecha: string): boolean {
  if (t.frecuencia !== "diaria") return false;
  if (t.fecha) return t.fecha === fecha; // tarea de una sola vez
  if (!t.dias_semana || t.dias_semana.length === 0) return true;
  return t.dias_semana.includes(diaSemanaDe(fecha));
}

/** Una tarea semanal aplica en la semana cuyo lunes es `lunes`. */
function tareaSemanalAplicaEnSemana(t: Tarea, lunes: string): boolean {
  if (t.frecuencia !== "semanal") return false;
  if (t.fecha) return lunesDe(t.fecha) === lunes; // semanal de una sola vez
  return true;
}

/**
 * Cuenta cuantas tareas del mes quedaron sin completar, contando solo
 * periodos YA CERRADOS y dias/semanas en que el trabajador asistio.
 *
 *  - Diarias: por cada dia del mes anterior a hoy en que hubo entrada, cada
 *    tarea diaria activa que aplicaba ese dia y no tiene registro de hecha.
 *  - Semanales: por cada semana del mes ya terminada (su domingo < hoy) con al
 *    menos una asistencia, cada tarea semanal activa sin registro de hecha.
 *
 * No se cuentan dias sin asistencia (esos ya son falta) ni tareas creadas
 * despues del periodo. El dia y la semana en curso no cuentan todavia, para
 * no castigar tareas que aun se pueden hacer.
 */
export type TareaIncompleta = {
  tareaId: string;
  titulo: string;
  frecuencia: FrecuenciaTarea;
  periodo: string; // "YYYY-MM-DD" del dia (diaria) o del lunes (semanal)
};

/**
 * Lista detallada de tareas del mes que quedaron sin completar, contando solo
 * periodos YA CERRADOS y dias/semanas en que el trabajador asistio. Excluye las
 * justificadas por el admin. Reglas:
 *
 *  - Diarias: por cada dia del mes anterior a hoy en que hubo entrada, cada
 *    tarea diaria activa que aplicaba ese dia, sin registro de hecha ni justificada.
 *  - Semanales: por cada semana del mes ya terminada (su domingo < hoy) con al
 *    menos una asistencia, cada tarea semanal activa sin registro ni justificada.
 *
 * No cuenta dias sin asistencia (esos ya son falta) ni tareas creadas despues
 * del periodo. El dia y la semana en curso no cuentan todavia.
 */
export function detalleTareasIncompletas(
  tareas: Tarea[],
  completadas: TareaCompletada[],
  justificadas: TareaJustificada[],
  marcas: Marca[],
  ahora: Date = new Date(),
): TareaIncompleta[] {
  const activas = tareas.filter((t) => t.activo);
  if (activas.length === 0) return [];

  const hoy = fechaHoyMx(ahora); // limite superior (exclusivo)
  const inicioMesFecha = hoy.slice(0, 8) + "01";
  const hechas = new Set(completadas.map((c) => `${c.tarea_id}|${c.periodo}`));
  const just = new Set(justificadas.map((j) => `${j.tarea_id}|${j.periodo}`));

  // Dias del mes (cerrados) en que el trabajador tuvo entrada.
  const diasTrabajados = new Set<string>();
  for (const m of marcas) {
    if (m.tipo !== "entrada") continue;
    const fecha = isoAFechaMx(m.marcado_en);
    if (fecha >= inicioMesFecha && fecha < hoy) diasTrabajados.add(fecha);
  }

  const out: TareaIncompleta[] = [];

  // Diarias
  for (const fecha of diasTrabajados) {
    for (const t of activas) {
      if (t.frecuencia !== "diaria") continue;
      if (fecha < isoAFechaMx(t.creado_en)) continue; // no existia ese dia
      if (!tareaDiariaAplicaEnFecha(t, fecha)) continue;
      const clave = `${t.id}|${fecha}`;
      if (hechas.has(clave) || just.has(clave)) continue;
      out.push({ tareaId: t.id, titulo: t.titulo, frecuencia: "diaria", periodo: fecha });
    }
  }

  // Semanales: semanas con asistencia cuyo domingo ya paso.
  const semanas = new Set<string>();
  for (const fecha of diasTrabajados) semanas.add(lunesDe(fecha));
  for (const lunes of semanas) {
    const domingo = sumarDias(lunes, 6);
    if (domingo >= hoy) continue; // la semana aun no termina
    for (const t of activas) {
      if (t.frecuencia !== "semanal") continue;
      if (domingo < isoAFechaMx(t.creado_en)) continue; // creada despues
      if (!tareaSemanalAplicaEnSemana(t, lunes)) continue;
      const clave = `${t.id}|${lunes}`;
      if (hechas.has(clave) || just.has(clave)) continue;
      out.push({ tareaId: t.id, titulo: t.titulo, frecuencia: "semanal", periodo: lunes });
    }
  }

  return out;
}

/** Cantidad de tareas no hechas (ver detalleTareasIncompletas). */
export function contarTareasIncompletas(
  tareas: Tarea[],
  completadas: TareaCompletada[],
  justificadas: TareaJustificada[],
  marcas: Marca[],
  ahora: Date = new Date(),
): number {
  return detalleTareasIncompletas(tareas, completadas, justificadas, marcas, ahora).length;
}
