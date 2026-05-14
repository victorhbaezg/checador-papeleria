import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase, type Trabajador } from "./supabase";

type AuthContextValue = {
  trabajador: Trabajador | null;
  cargando: boolean;
  iniciarSesion: (usuario: string, password: string) => Promise<{ error?: string }>;
  cerrarSesion: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Convierte "usuario" (texto simple que ven los trabajadores) a un email
 * que Supabase Auth pueda manejar. Supabase Auth requiere email, asi que
 * usamos el dominio de la papeleria como sufijo interno.
 */
const DOMINIO_USUARIOS = "cyber7.mx";

function usuarioAEmail(usuario: string): string {
  const limpio = usuario.trim().toLowerCase().replace(/\s+/g, "");
  return `${limpio}@${DOMINIO_USUARIOS}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [trabajador, setTrabajador] = useState<Trabajador | null>(null);
  const [cargando, setCargando] = useState(true);

  // Al cargar, revisar si hay sesion previa
  useEffect(() => {
    const cargarSesion = async () => {
      const { data: sesion } = await supabase.auth.getSession();
      if (sesion.session) {
        await cargarPerfil(sesion.session.user.id);
      }
      setCargando(false);
    };
    cargarSesion();

    // Escuchar cambios de auth (login / logout)
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        await cargarPerfil(session.user.id);
      } else {
        setTrabajador(null);
      }
    });

    return () => sub.subscription.unsubscribe();
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
    if (error) return { error: "Usuario o contraseña incorrectos." };
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
