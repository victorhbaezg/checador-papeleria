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
  // lun(1)→+0d, mar(2)→+1d, ..., sab(6)→+5d, dom(0)→+6d
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
 * Calcula el resumen semanal (lunes → hoy) de un trabajador.
 *
 * @param marcas    Todas sus marcas de la semana (lunes a hoy, ya filtradas).
 * @param horarios  Sus 7 renglones de horario (uno por dia de semana).
 * @param tarifaHora Pago por hora en MXN.
 * @param ahora     Fecha/hora actual (inyectable para tests; por defecto new Date()).
 */
export function calcularResumenSemana(
  marcas: Marca[],
  horarios: Horario[],
  tarifaHora: number,
  ahora: Date = new Date(),
): ResumenSemana {
  const diaSemanaHoy = diaSemanaMx(ahora);

  // Dias de la semana (en convencion 0=dom..6=sab) transcurridos lunes→hoy.
  // Lunes siempre esta incluido (aunque sea el mismo dia).
  const diasEnRango: number[] = [];
  if (diaSemanaHoy === 0) {
    // Domingo: semana completa lun-dom
    for (let d = 1; d <= 6; d++) diasEnRango.push(d);
    diasEnRango.push(0);
  } else {
    for (let d = 1; d <= diaSemanaHoy; d++) diasEnRango.push(d);
  }

  // Horarios activos (no descansa) en el rango lunes-hoy.
  const horariosLaborales = horarios.filter(
    (h) => diasEnRango.includes(h.dia_semana) && !h.descansa,
  );

  // Inicio del lunes de la semana (UTC) para poder convertir dia_semana→fecha.
  const inicioLunesUtc = inicioSemanaMx(ahora);

  // Fechas (YYYY-MM-DD en MX) donde el trabajador registro al menos una entrada.
  const fechasConEntrada = new Set<string>();
  for (const m of marcas) {
    if (m.tipo === "entrada") {
      fechasConEntrada.add(isoAFechaMx(m.marcado_en));
    }
  }

  // Faltas = dias laborales sin ninguna entrada.
  const faltas = horariosLaborales.filter(
    (h) => !fechasConEntrada.has(diaAFechaSemana(h.dia_semana, inicioLunesUtc)),
  ).length;

  // Agrupar marcas por fecha local para calcular horas por jornada.
  const porDia = new Map<string, { entradas: Marca[]; salidas: Marca[] }>();
  for (const m of marcas) {
    const fecha = isoAFechaMx(m.marcado_en);
    if (!porDia.has(fecha)) porDia.set(fecha, { entradas: [], salidas: [] });
    if (m.tipo === "entrada") {
      porDia.get(fecha)!.entradas.push(m);
    } else {
      porDia.get(fecha)!.salidas.push(m);
    }
  }

  // Horas trabajadas = suma de jornadas con entrada Y salida.
  let horasTrabajadas = 0;
  for (const { entradas, salidas } of porDia.values()) {
    if (entradas.length > 0 && salidas.length > 0) {
      // Primera entrada del dia vs ultima salida del dia.
      const msEntrada = new Date(entradas[0].marcado_en).getTime();
      const msSalida = new Date(salidas[salidas.length - 1].marcado_en).getTime();
      const ms = msSalida - msEntrada;
      if (ms > 0) horasTrabajadas += ms / (1000 * 60 * 60);
    }
  }

  // Retardos = marcas de entrada con nota='retardo'.
  const retardos = marcas.filter(
    (m) => m.tipo === "entrada" && m.nota === "retardo",
  ).length;

  return {
    horasTrabajadas,
    retardos,
    faltas,
    totalPago: horasTrabajadas * tarifaHora,
  };
}
