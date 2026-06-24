import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Faltan las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. " +
      "Copia .env.example a .env y llena los valores.",
  );
}

// Lock no-op: bypass al mecanismo de Web Locks que usa Supabase JS por
// dentro. Sin esto, en algunos navegadores y especialmente con el service
// worker de la PWA, el lock se queda tomado y getSession() se cuelga
// indefinidamente al abrir la app. Para una app pequena con un usuario
// por dispositivo, no necesitamos coordinar entre pestanas, asi que
// quitar el lock es seguro y soluciona el bug.
const lockNoOp = async <R,>(_name: string, _timeout: number, fn: () => Promise<R>): Promise<R> => {
  return fn();
};

// Tiempo maximo que esperamos a CUALQUIER peticion de red a Supabase antes
// de abortarla. Sin esto, si la conexion queda colgada (el celular se durmio,
// cambiaste de app, o hubo un parpadeo de red) la consulta espera para
// siempre y la pantalla se queda en "Cargando..." hasta recargar a mano.
// Al abortar, supabase-js devuelve un error normal y la app puede seguir.
const TIMEOUT_PETICION_MS = 12000;

const fetchConTimeout: typeof fetch = (input, init) => {
  const controlador = new AbortController();
  const id = setTimeout(() => controlador.abort(), TIMEOUT_PETICION_MS);

  // Respetamos cualquier signal que ya venga en la peticion original.
  const signalOriginal = init?.signal;
  if (signalOriginal) {
    if (signalOriginal.aborted) controlador.abort();
    else signalOriginal.addEventListener("abort", () => controlador.abort(), { once: true });
  }

  return fetch(input, { ...init, signal: controlador.signal }).finally(() => clearTimeout(id));
};

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    lock: lockNoOp,
  },
  global: { fetch: fetchConTimeout },
});

// ---- Tipos de las tablas (sincronizados con ESQUEMA_BD.sql) ----

export type Trabajador = {
  id: string;
  auth_user_id: string | null;
  nombre: string;
  usuario: string;
  tarifa_hora: number;
  es_admin: boolean;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
};

export type Horario = {
  id: string;
  trabajador_id: string;
  dia_semana: number; // 0=domingo, 6=sabado
  hora_entrada_esperada: string; // "08:00:00"
  hora_salida_esperada: string;
  descansa: boolean;
  hora_pausa_inicio: string | null; // "16:30:00" o null si no hay pausa ese dia
  hora_pausa_fin: string | null; // "17:00:00" o null
};

/** Los cuatro tipos de marca posibles. */
export type TipoMarca = "entrada" | "salida" | "pausa_inicio" | "pausa_fin";

export type Marca = {
  id: string;
  trabajador_id: string;
  tipo: TipoMarca;
  marcado_en: string;
  lat: number | null;
  lng: number | null;
  qr_codigo_escaneado: string | null;
  qr_valido: boolean;
  editada_por_admin: boolean;
  nota: string | null;
  // Minutos de retraso desde la hora de entrada. Solo en entradas con retardo.
  minutos_tarde: number | null;
  justificada: boolean;
  justificada_nota: string | null;
  creado_en: string;
};

export type Configuracion = {
  id: 1;
  qr_local: string;
  tolerancia_retardo_minutos: number;
  monto_bono_mensual: number;
  // Pesos que se descuentan por cada tarea de periodo cerrado no hecha ni justificada. 0 = desactivado.
  monto_sancion_tarea: number;
  dia_corte_semana: number;
  // Umbral semanal (min). Si la suma de retardos llega aqui, se descuenta el
  // tiempo tarde. 0 = sancion desactivada.
  umbral_sancion_minutos: number;
  actualizado_en: string;
};

/** Excepcion de horario para un trabajador en una fecha especifica. */
export type HorarioExcepcion = {
  id: string;
  trabajador_id: string;
  fecha: string; // "YYYY-MM-DD"
  hora_entrada_esperada: string | null; // "HH:MM:SS" o null si es_dia_libre
  hora_salida_esperada: string | null;
  // Pausa propia de la excepcion. NULL = ese dia no tiene pausa programada.
  hora_pausa_inicio: string | null;
  hora_pausa_fin: string | null;
  es_dia_libre: boolean;
  nota: string | null;
  creado_en: string;
};

/** Falta excusada por el admin para un trabajador en una fecha especifica. */
export type FaltaJustificada = {
  id: string;
  trabajador_id: string;
  fecha: string; // "YYYY-MM-DD"
  nota: string | null;
  creado_en: string;
};

/** Frecuencia con la que se reinicia una tarea. */
export type FrecuenciaTarea = "diaria" | "semanal";

/** Tarea de limpieza/orden asignada a un trabajador. */
export type Tarea = {
  id: string;
  trabajador_id: string;
  titulo: string;
  frecuencia: FrecuenciaTarea;
  // Solo para frecuencia "diaria": dias de la semana en que aplica (0=dom..6=sab).
  // null o vacio = todos los dias.
  dias_semana: number[] | null;
  // Tarea de una sola vez: diaria = ese dia exacto ("YYYY-MM-DD"); semanal =
  // la semana que contiene esa fecha. null = recurrente.
  fecha: string | null;
  activo: boolean;
  orden: number;
  creado_en: string;
};

/** Registro de una tarea marcada como hecha en un periodo (dia o semana). */
export type TareaCompletada = {
  id: string;
  tarea_id: string;
  trabajador_id: string;
  periodo: string; // "YYYY-MM-DD" del dia (diaria) o del lunes (semanal)
  completada_en: string;
};

/** Tarea no hecha que el admin justifico: no rompe el bono ni descuenta. */
export type TareaJustificada = {
  id: string;
  tarea_id: string;
  trabajador_id: string;
  periodo: string; // mismo formato que TareaCompletada.periodo
  nota: string | null;
  creado_en: string;
};
