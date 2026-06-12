/**
 * Logica pura para el reporte semanal de pago.
 *
 * Todas las funciones son puras (no tocan Supabase) para que sean
 * faciles de razonar y de probar.
 */

import type { Horario, Marca } from "./supabase";
import { diaSemanaMx, inicioSemanaMx, ZONA_HORARIA } from "./marcado";

export type ResumenSemana = {
  horasTrabajadas: number;
  retardos: number;
  faltas: number;
  totalPago: number;
};

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
 * de la semana actual, devuelve la fecha "YYYY-MM-DD" en zona Mexico
 * que le corresponde.
 */
function diaAFechaSemana(diaSemana: number, inicioLunesUtc: Date): string {
  // lun(1)->+0d, mar(2)->+1d, ..., sab(6)->+5d, dom(0)->+6d
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
 *
 * @param marcas         Todas sus marcas de la semana (lunes a hoy, ya filtradas).
 * @param horarios       Sus 7 renglones de horario (uno por dia de semana).
 * @param tarifaHora     Pago por hora en MXN.
 * @param diasExcluidos  Fechas (YYYY-MM-DD) que NO deben contar como faltas:
 *                       union de horario_excepciones(es_dia_libre=true) + faltas_justificadas.
 * @param ahora          Fecha/hora actual (inyectable para tests; por defecto new Date()).
 */
export function calcularResumenSemana(
  marcas: Marca[],
  horarios: Horario[],
  tarifaHora: number,
  diasExcluidos: Set<string> = new Set(),
  ahora: Date = new Date(),
): ResumenSemana {
  const diaSemanaHoy = diaSemanaMx(ahora);

  // Dias de la semana (en convencion 0=dom..6=sab) transcurridos lunes->hoy.
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

  // Faltas = dias laborales sin entrada Y no excluidos (justificados o dia libre por excepcion)
  const faltas = horariosLaborales.filter((h) => {
    const fecha = diaAFechaSemana(h.dia_semana, inicioLunesUtc);
    return !fechasConEntrada.has(fecha) && !diasExcluidos.has(fecha);
  }).length;

  const porDia = new Map<string, { entradas: Marca[]; salidas: Marca[] }>();
  for (const m of marcas) {
    const fecha = isoAFechaMx(m.marcado_en);
    if (!porDia.has(fecha)) porDia.set(fecha, { entradas: [], salidas: [] });
    if (m.tipo === "entrada") {
      porDia.get(fecha)!.entradas.push(m);
    } else if (m.tipo === "salida") {
      porDia.get(fecha)!.salidas.push(m);
    }
    // Las marcas de pausa (pausa_inicio/pausa_fin) se ignoran aqui: la pausa
    // se paga normal, asi que las horas siguen siendo entrada -> ultima salida.
  }

  let horasTrabajadas = 0;
  for (const { entradas, salidas } of porDia.values()) {
    if (entradas.length > 0 && salidas.length > 0) {
      const msEntrada = new Date(entradas[0].marcado_en).getTime();
      const msSalida = new Date(salidas[salidas.length - 1].marcado_en).getTime();
      const ms = msSalida - msEntrada;
      if (ms > 0) horasTrabajadas += ms / (1000 * 60 * 60);
    }
  }

  // Retardos = entradas con nota='retardo' que NO esten justificadas
  const retardos = marcas.filter(
    (m) => m.tipo === "entrada" && m.nota === "retardo" && !m.justificada,
  ).length;

  return {
    horasTrabajadas,
    retardos,
    faltas,
    totalPago: horasTrabajadas * tarifaHora,
  };
}

// ==================================================================
// REPORTE MENSUAL
// ==================================================================

export type ResumenMes = {
  horasTrabajadas: number;
  retardos: number;
  faltas: number;
  totalSueldo: number;
  bono: number;
  ganoBonoMes: boolean;
  totalConBono: number;
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
 *
 * @param marcas         Todas sus marcas del mes (ya filtradas desde inicioMesMx).
 * @param horarios       Sus renglones de horario (uno por dia de semana).
 * @param tarifaHora     Pago por hora en MXN.
 * @param montoBono      Importe del bono mensual (default 250).
 * @param diasExcluidos  Fechas (YYYY-MM-DD) que NO deben contar como faltas:
 *                       union de horario_excepciones(es_dia_libre=true) + faltas_justificadas.
 * @param ahora          Fecha/hora actual (inyectable para tests).
 */
export function calcularResumenMes(
  marcas: Marca[],
  horarios: Horario[],
  tarifaHora: number,
  montoBono: number = 250,
  diasExcluidos: Set<string> = new Set(),
  ahora: Date = new Date(),
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

    // Es falta si: es dia laboral, sin entrada, y NO esta excluido
    if (
      horarioPorDia.has(diaNum) &&
      !fechasConEntrada.has(fechaStr) &&
      !diasExcluidos.has(fechaStr)
    ) {
      faltas++;
    }

    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  // Retardos = entradas con nota='retardo' que NO esten justificadas
  const retardos = marcas.filter(
    (m) => m.tipo === "entrada" && m.nota === "retardo" && !m.justificada,
  ).length;

  const porDia = new Map<string, { entradas: Marca[]; salidas: Marca[] }>();
  for (const m of marcas) {
    const fecha = isoAFechaMx(m.marcado_en);
    if (!porDia.has(fecha)) porDia.set(fecha, { entradas: [], salidas: [] });
    if (m.tipo === "entrada") porDia.get(fecha)!.entradas.push(m);
    else if (m.tipo === "salida") porDia.get(fecha)!.salidas.push(m);
    // Las marcas de pausa no cuentan para el emparejado de horas.
  }

  let horasTrabajadas = 0;
  for (const { entradas, salidas } of porDia.values()) {
    if (entradas.length > 0 && salidas.length > 0) {
      const ms =
        new Date(salidas[salidas.length - 1].marcado_en).getTime() -
        new Date(entradas[0].marcado_en).getTime();
      if (ms > 0) horasTrabajadas += ms / 3_600_000;
    }
  }

  const ganoBonoMes = faltas === 0 && retardos === 0;
  const bono = ganoBonoMes ? montoBono : 0;
  const totalSueldo = horasTrabajadas * tarifaHora;

  return {
    horasTrabajadas,
    retardos,
    faltas,
    totalSueldo,
    bono,
    ganoBonoMes,
    totalConBono: totalSueldo + bono,
  };
}
