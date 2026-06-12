import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Marcar from "./pages/Marcar";
import MisMarcas from "./pages/MisMarcas";
import MiMes from "./pages/MiMes";
import Tareas from "./pages/Tareas";
import AdminDashboard from "./pages/AdminDashboard";
import TrabajadoresList from "./pages/admin/TrabajadoresList";
import TrabajadorForm from "./pages/admin/TrabajadorForm";
import ConfiguracionPage from "./pages/admin/Configuracion";
import QrImprimir from "./pages/admin/QrImprimir";
import ReporteSemanal from "./pages/admin/ReporteSemanal";
import ReporteMensual from "./pages/admin/ReporteMensual";
import ExcepcionesHorario from "./pages/admin/ExcepcionesHorario";
import HistorialMarcas from "./pages/admin/HistorialMarcas";
import AdminTareas from "./pages/admin/Tareas";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./lib/auth";

export default function App() {
  const { cargando } = useAuth();

  if (cargando) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500">
        Cargando...
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/marcar" element={<ProtectedRoute><Marcar /></ProtectedRoute>} />
      <Route path="/mis-marcas" element={<ProtectedRoute><MisMarcas /></ProtectedRoute>} />
      <Route path="/mi-mes" element={<ProtectedRoute><MiMes /></ProtectedRoute>} />
      <Route path="/tareas" element={<ProtectedRoute><Tareas /></ProtectedRoute>} />

      <Route path="/admin" element={<ProtectedRoute soloAdmin><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/trabajadores" element={<ProtectedRoute soloAdmin><TrabajadoresList /></ProtectedRoute>} />
      <Route path="/admin/trabajadores/nuevo" element={<ProtectedRoute soloAdmin><TrabajadorForm /></ProtectedRoute>} />
      <Route path="/admin/trabajadores/:id" element={<ProtectedRoute soloAdmin><TrabajadorForm /></ProtectedRoute>} />
      <Route path="/admin/configuracion" element={<ProtectedRoute soloAdmin><ConfiguracionPage /></ProtectedRoute>} />
      <Route path="/admin/configuracion/imprimir" element={<ProtectedRoute soloAdmin><QrImprimir /></ProtectedRoute>} />
      <Route path="/admin/reporte" element={<ProtectedRoute soloAdmin><ReporteSemanal /></ProtectedRoute>} />
      <Route path="/admin/reporte-mensual" element={<ProtectedRoute soloAdmin><ReporteMensual /></ProtectedRoute>} />
      <Route path="/admin/excepciones" element={<ProtectedRoute soloAdmin><ExcepcionesHorario /></ProtectedRoute>} />
      <Route path="/admin/historial" element={<ProtectedRoute soloAdmin><HistorialMarcas /></ProtectedRoute>} />
      <Route path="/admin/tareas" element={<ProtectedRoute soloAdmin><AdminTareas /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
