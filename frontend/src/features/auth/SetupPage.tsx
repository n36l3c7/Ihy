import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { createFirstAdmin, getMe, getSetupStatus, login } from "../../api/auth";
import { ApiError } from "../../api/http";
import { Logo } from "../../components/Logo";
import { useAuthStore } from "../../stores/authStore";
import { buttonClass, inputClass } from "./LoginPage";

export function SetupPage() {
  const navigate = useNavigate();
  const setTokens = useAuthStore((state) => state.setTokens);
  const setUser = useAuthStore((state) => state.setUser);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getSetupStatus()
      .then((status) => {
        if (!status.needs_setup) navigate("/login", { replace: true });
      })
      .catch(() => {});
  }, [navigate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await createFirstAdmin(username, password);
      const tokens = await login(username, password);
      setTokens(tokens.access_token, tokens.refresh_token);
      setUser(await getMe());
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Setup failed, please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="mb-4 flex items-center gap-3">
        <Logo className="h-12 w-12 text-emerald-500" />
        <h1 className="text-4xl font-bold tracking-tight">Ihy</h1>
      </div>
      <p className="mb-8 text-sm text-zinc-400">Create the admin account to get started</p>
      <form onSubmit={handleSubmit} className="flex w-80 flex-col gap-3">
        <input
          className={inputClass}
          placeholder="Username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoFocus
          required
          minLength={3}
        />
        <input
          className={inputClass}
          type="password"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
        />
        <input
          className={inputClass}
          type="password"
          placeholder="Confirm password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          required
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={loading} className={buttonClass}>
          {loading ? "Creating account..." : "Create admin account"}
        </button>
      </form>
    </div>
  );
}
