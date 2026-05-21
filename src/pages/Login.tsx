import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { iniciarSesion, trabajador } = useAuth();
  const navigate = useNavigate();

  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Si ya hay sesion, mandar al inicio
  if (trabajador) {
    navigate("/", { replace: true });
  }

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const res = await iniciarSesion(usuario, password);
    setEnviando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    navigate("/", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-navy-700">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#34c0c8"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-marca-600">
            Cyber 7
          </p>
          <h1 className="mt-1 text-2xl font-bold text-navy-700">Control de asistencia</h1>
          <p className="mt-1 text-sm text-slate-500">
            Inicia sesion con el usuario que te dieron
          </p>
        </div>

        <form onSubmit={enviar} className="card space-y-4">
          <div>
            <label className="label-section mb-1.5 block">Usuario</label>
            <input
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              required
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              className="input-field"
              placeholder="tu_usuario"
            />
          </div>

          <div>
            <label className="label-section mb-1.5 block">Contrasena</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="Tu contrasena"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
              {error}
            </div>
          )}

          <button type="submit" disabled={enviando} className="btn-primary w-full">
            {enviando ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Si olvidaste tu contrasena, pidele a Hugo que te la reinicie.
        </p>
      </div>
    </div>
  );
}
