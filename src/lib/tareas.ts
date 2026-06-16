/**
 * Helpers para la lista de tareas (limpieza/orden) de cada trabajador.
 *
 * Una tarea "diaria" se reinicia cada dia; una "semanal" cada lunes.
 * Que una tarea este hecha = existe un renglon en `tareas_completadas`
 * con su `tarea_id` y la `clavePeriodo` correspondiente.
 */

import {
  supabase,
  type Tarea,
  type TareaCompletada,
} from "./supabase";
import { clavePeriodo, diaSemanaMx } from "./marcado";
import { lunesDe } from "./planner";

/** Una tarea con su estado (hecha o no) para el periodo actual. */
export type TareaConEstado = Tarea & { hecha: boolean; periodo: string };

export type ResumenTareas = {
  items: TareaConEstado[];
  total: number;
  hechas: number;
  pendientes: number;
};

/**
 * Carga las tareas activas de un trabajador y resuelve cuales estan hechas
 * hoy (diarias) o esta semana (semanales).
 */
export async function cargarTareas(
  trabajadorId: string,
  ahora: Date = new Date(),
): Promise<ResumenTareas> {
  const { data: tareasData } = await supabase
    .from("tareas")
    .select("*")
    .eq("trabajador_id", trabajadorId)
    .eq("activo", true)
    .order("frecuencia", { ascending: true })
    .order("orden", { ascending: true })
    .order("creado_en", { ascending: true });
  const tareas = (tareasData ?? []) as Tarea[];

  const claveDiaria = clavePeriodo("diaria", ahora);
  const claveSemanal = clavePeriodo("semanal", ahora);
  const periodos = Array.from(new Set([claveDiaria, claveSemanal]));

  const { data: compData } = await supabase
    .from("tareas_completadas")
    .select("*")
    .eq("trabajador_id", trabajadorId)
    .in("periodo", periodos);
  const comp = (compData ?? []) as TareaCompletada[];
  const hechasSet = new Set(comp.map((c) => `${c.tarea_id}|${c.periodo}`));

  // Reglas de cuando una tarea aplica "hoy":
  //  - semanal recurrente: siempre; semanal de una vez: solo si su fecha cae
  //    en la semana actual.
  //  - diaria de una vez: solo ese dia exacto.
  //  - diaria recurrente: todos los dias, o solo los dias_semana indicados.
  const hoyDia = diaSemanaMx(ahora);
  const aplicaHoy = (t: Tarea): boolean => {
    if (t.frecuencia === "semanal") {
      return t.fecha ? lunesDe(t.fecha) === claveSemanal : true;
    }
    if (t.fecha) return t.fecha === claveDiaria;
    if (!t.dias_semana || t.dias_semana.length === 0) return true;
    return t.dias_semana.includes(hoyDia);
  };

  const items: TareaConEstado[] = tareas.filter(aplicaHoy).map((t) => {
    const periodo = t.frecuencia === "semanal" ? claveSemanal : claveDiaria;
    return { ...t, periodo, hecha: hechasSet.has(`${t.id}|${periodo}`) };
  });

  const hechas = items.filter((i) => i.hecha).length;
  return { items, total: items.length, hechas, pendientes: items.length - hechas };
}

/** Marca o desmarca una tarea para su periodo (insert o delete). */
export async function alternarTarea(
  tarea: TareaConEstado,
  trabajadorId: string,
): Promise<void> {
  if (tarea.hecha) {
    await supabase
      .from("tareas_completadas")
      .delete()
      .eq("tarea_id", tarea.id)
      .eq("periodo", tarea.periodo);
  } else {
    await supabase.from("tareas_completadas").insert({
      tarea_id: tarea.id,
      trabajador_id: trabajadorId,
      periodo: tarea.periodo,
    });
  }
}
