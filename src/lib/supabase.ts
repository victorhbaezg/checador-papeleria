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

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    lock: lockNoOp,
  },
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
  justificada: boolean;
  justificada_nota: string | null;
  creado_en: string;
};

export type Configuracion = {
  id: 1;
  qr_local: string;
  tolerancia_retardo_minutos: number;
  monto_bono_mensual: number;
  dia_corte_semana: number;
  actualizado_en: string;
};

/** Excepcion de horario para un trabajador en una fecha especifica. */
export type HorarioExcepcion = {
  id: string;
  trabajador_id: string;
  fecha: string; // "YYYY-MM-DD"
  hora_entrada_esperada: string | null; // "HH:MM:SS" o null si es_dia_libre
  hora_salida_esperada: string | null;
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
