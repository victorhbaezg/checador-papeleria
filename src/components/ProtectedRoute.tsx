import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Si es true, solo trabajadores con es_admin=true pueden entrar */
  soloAdmin?: boolean;
};

export default function ProtectedRoute({ children, soloAdmin = false }: Props) {
  const { trabajador, cargando } = useAuth();

  if (cargando) return null;

  if (!trabajador) {
    return <Navigate to="/login" replace />;
  }

  if (soloAdmin && !trabajador.es_admin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
