import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Home from "./pages/Home";
import AdminDashboard from "./pages/AdminDashboard";
import TrabajadoresList from "./pages/admin/TrabajadoresList";
import TrabajadorForm from "./pages/admin/TrabajadorForm";
import ConfiguracionPage from "./pages/admin/Configuracion";
import QrImprimir from "./pages/admin/QrImprimir";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./lib/auth";

export default function App() {
  const { cargando } = useAuth();

  if (cargando) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500">
        Cargando…
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute soloAdmin>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/trabajadores"
        element={
          <ProtectedRoute soloAdmin>
            <TrabajadoresList />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/trabajadores/nuevo"
        element={
          <ProtectedRoute soloAdmin>
            <TrabajadorForm />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/trabajadores/:id"
        element={
          <ProtectedRoute soloAdmin>
            <TrabajadorForm />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/configuracion"
        element={
          <ProtectedRoute soloAdmin>
            <ConfiguracionPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/configuracion/imprimir"
        element={
          <ProtectedRoute soloAdmin>
            <QrImprimir />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
