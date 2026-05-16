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
};

export type Marca = {
  id: string;
  trabajador_id: string;
  tipo: "entrada" | "salida";
  marcado_en: string;
  lat: number | null;
  lng: number | null;
  qr_codigo_escaneado: string | null;
  qr_valido: boolean;
  editada_por_admin: boolean;
  nota: string | null;
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
