import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase, type Trabajador } from "./supabase";

type AuthContextValue = {
  trabajador: Trabajador | null;
  cargando: boolean;
  iniciarSesion: (usuario: string, password: string) => Promise<{ error?: string }>;
  cerrarSesion: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Convierte "usuario" (texto simple que ven los trabajadores) a un email
// que Supabase Auth pueda manejar. Supabase Auth requiere email, asi que
// usamos el dominio de la papeleria como sufijo interno.
const DOMINIO_USUARIOS = "cyber7.mx";

function usuarioAEmail(usuario: string): string {
  const limpio = usuario.trim().toLowerCase().replace(/\s+/g, "");
  return `${limpio}@${DOMINIO_USUARIOS}`;
}

// Timeout de seguridad para que el chequeo inicial de sesion nunca se quede
// colgado. Si Supabase no responde en este tiempo, la app suelta el
// "Cargando..." y manda al login para que el usuario reintente.
const TIMEOUT_CARGA_INICIAL_MS = 6000;

function conTimeout<T>(p: Promise<T>, ms: number, etiqueta: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("Timeout: " + etiqueta)), ms);
    p.then(
      (v) => { clearTimeout(id); resolve(v); },
      (e) => { clearTimeout(id); reject(e); },
    );
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [trabajador, setTrabajador] = useState<Trabajador | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;

    const cargarSesion = async () => {
      try {
        const { data: sesion } = await conTimeout(
          supabase.auth.getSession(),
          TIMEOUT_CARGA_INICIAL_MS,
          "getSession",
        );
        if (cancelado) return;
        if (sesion.session) {
          await conTimeout(
            cargarPerfil(sesion.session.user.id),
            TIMEOUT_CARGA_INICIAL_MS,
            "cargarPerfil",
          );
        }
      } catch (err) {
        // No queremos quedarnos en "Cargando..." pase lo que pase.
        // Si la sesion esta corrupta o Supabase no responde, mostramos
        // el login (trabajador=null) y dejamos que el usuario reintente.
        console.error("[auth] Fallo al cargar sesion inicial:", err);
        if (!cancelado) setTrabajador(null);

        // Bug conocido del SDK de Supabase: si el token guardado queda
        // en un estado intermedio (p.ej. la pestana se cerro a media
        // renovacion), getSession() se cuelga indefinidamente.
        // Al detectar el timeout limpiamos el storage local para que
        // el proximo arranque parta limpio en vez de volver a colgarse.
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch (signOutErr) {
          console.error("[auth] Fallo limpiando sesion corrupta:", signOutErr);
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    };
    void cargarSesion();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelado) return;
      if (!session) {
        setTrabajador(null);
        return;
      }
      // No usamos await directo aqui: el SDK de Supabase recomienda NO llamar
      // otras funciones de Supabase dentro del callback (puede bloquear el
      // manejo interno de la sesion y dejar la app colgada al volver de
      // segundo plano). Diferimos la consulta con setTimeout para sacarla
      // del callback.
      setTimeout(() => {
        if (cancelado) return;
        cargarPerfil(session.user.id).catch((err) => {
          console.error("[auth] Fallo al refrescar perfil:", err);
          setTrabajador(null);
        });
      }, 0);
    });

    return () => {
      cancelado = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const cargarPerfil = async (authUserId: string) => {
    const { data, error } = await supabase
      .from("trabajadores")
      .select("*")
      .eq("auth_user_id", authUserId)
      .single();
    if (error) {
      console.error("Error cargando perfil:", error);
      setTrabajador(null);
      return;
    }
    setTrabajador(data as Trabajador);
  };

  const iniciarSesion = async (usuario: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: usuarioAEmail(usuario),
      password,
    });
    if (error) return { error: "Usuario o contrasena incorrectos." };
    return {};
  };

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    setTrabajador(null);
  };

  return (
    <AuthContext.Provider value={{ trabajador, cargando, iniciarSesion, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
