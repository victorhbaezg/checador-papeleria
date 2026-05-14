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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-marca-500 text-white">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              className="h-8 w-8"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6l4 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Checador Papelería</h1>
          <p className="mt-1 text-sm text-slate-500">
            Inicia sesión con el usuario que te dieron
          </p>
        </div>

        <form onSubmit={enviar} className="card space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Usuario
            </label>
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
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Contraseña
            </label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
              {error}
            </div>
          )}

          <button type="submit" disabled={enviando} className="btn-primary w-full">
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          ¿Olvidaste tu contraseña? Pídele a Hugo que te la reinicie.
        </p>
      </div>
    </div>
  );
}
