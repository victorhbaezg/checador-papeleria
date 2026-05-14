import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Home from "./pages/Home";
import AdminDashboard from "./pages/AdminDashboard";
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

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
