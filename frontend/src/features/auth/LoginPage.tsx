import { ListMusic } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { getMe, getSetupStatus, login } from "../../api/auth";
import { ApiError } from "../../api/http";
import { useAuthStore } from "../../stores/authStore";

export const inputClass =
  "w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-emerald-500";

export const buttonClass =
  "w-full rounded-md bg-emerald-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50";

export function LoginPage() {
  const navigate = useNavigate();
  const setTokens = useAuthStore((state) => state.setTokens);
  const setUser = useAuthStore((state) => state.setUser);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getSetupStatus()
      .then((status) => {
        if (status.needs_setup) navigate("/setup", { replace: true });
      })
      .catch(() => {});
  }, [navigate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const tokens = await login(username, password);
      setTokens(tokens.access_token, tokens.refresh_token);
      setUser(await getMe());
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Invalid username or password"
          : "Login failed, please try again",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="mb-8 flex items-center gap-3">
        <ListMusic className="h-10 w-10 text-emerald-500" />
        <h1 className="text-4xl font-bold tracking-tight">Ihy</h1>
      </div>
      <form onSubmit={handleSubmit} className="flex w-80 flex-col gap-3">
        <input
          className={inputClass}
          placeholder="Username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoFocus
          required
        />
        <input
          className={inputClass}
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={loading} className={buttonClass}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
