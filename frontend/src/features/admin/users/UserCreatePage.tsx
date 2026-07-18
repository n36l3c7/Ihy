import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";

import { createUser } from "../../../api/admin";
import { ApiError } from "../../../api/http";
import { buttonClass, inputClass } from "../../auth/LoginPage";

const labelClass = "mb-1 block text-xs font-medium text-zinc-400";

export function UserCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    username: "",
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    role: "user" as "admin" | "user",
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      createUser({
        username: form.username.trim(),
        password: form.password,
        email: form.email.trim() || undefined,
        first_name: form.first_name.trim() || undefined,
        last_name: form.last_name.trim() || undefined,
        role: form.role,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      navigate("/settings/users");
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to create user"),
  });

  const set =
    (field: keyof typeof form) => (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    createMutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-lg rounded-lg border border-zinc-800 p-5">
      <div className="flex flex-col gap-4">
        <div>
          <label className={labelClass}>Username *</label>
          <input
            className={inputClass}
            value={form.username}
            onChange={set("username")}
            required
            minLength={3}
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>First name</label>
            <input className={inputClass} value={form.first_name} onChange={set("first_name")} />
          </div>
          <div>
            <label className={labelClass}>Last name</label>
            <input className={inputClass} value={form.last_name} onChange={set("last_name")} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input className={inputClass} type="email" value={form.email} onChange={set("email")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Password * (min 8 characters)</label>
            <input
              className={inputClass}
              type="password"
              value={form.password}
              onChange={set("password")}
              required
              minLength={8}
            />
          </div>
          <div>
            <label className={labelClass}>Role</label>
            <select className={inputClass} value={form.role} onChange={set("role")}>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className={`${buttonClass} w-auto px-5`}
          >
            <span className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              {createMutation.isPending ? "Creating..." : "Create user"}
            </span>
          </button>
        </div>
      </div>
    </form>
  );
}
