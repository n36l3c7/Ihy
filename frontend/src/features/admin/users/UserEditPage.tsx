import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { deleteUser, getUser, updateUser, type UserUpdatePayload } from "../../../api/admin";
import { ApiError } from "../../../api/http";
import { PageSpinner } from "../../../components/Spinner";
import { useAuthStore } from "../../../stores/authStore";
import { buttonClass, inputClass } from "../../auth/LoginPage";

const labelClass = "mb-1 block text-xs font-medium text-zinc-400";

interface FormState {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  role: "admin" | "user";
  is_active: boolean;
}

export function UserEditPage() {
  const { userId } = useParams();
  const id = Number(userId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const query = useQuery({ queryKey: ["user", userId], queryFn: () => getUser(id) });

  useEffect(() => {
    if (query.data && form === null) {
      setForm({
        first_name: query.data.first_name ?? "",
        last_name: query.data.last_name ?? "",
        email: query.data.email ?? "",
        password: "",
        role: query.data.role,
        is_active: query.data.is_active,
      });
    }
  }, [query.data, form]);

  const saveMutation = useMutation({
    mutationFn: (changes: UserUpdatePayload) => updateUser(id, changes),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["user", userId] });
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to save"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteUser(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      navigate("/settings/users");
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to delete"),
  });

  if (query.isPending || form === null) return <PageSpinner />;
  if (query.isError) return <p className="text-red-400">Failed to load user.</p>;
  const user = query.data;
  const isSelf = user.id === currentUser?.id;

  const set =
    (field: keyof FormState) => (event: { target: { value: string } }) =>
      setForm((current) => current && { ...current, [field]: event.target.value });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const changes: UserUpdatePayload = {
      first_name: form.first_name.trim() || null,
      last_name: form.last_name.trim() || null,
      email: form.email.trim() || null,
      role: form.role,
      is_active: form.is_active,
    };
    if (form.password) changes.password = form.password;
    saveMutation.mutate(changes);
  };

  const handleDelete = () => {
    if (window.confirm(`Delete user "${user.username}"? Their personal data is removed.`)) {
      deleteMutation.mutate();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-lg rounded-lg border border-zinc-800 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">
          {user.username}
          {isSelf && <span className="ml-2 text-xs text-emerald-500">(you)</span>}
        </h2>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isSelf || deleteMutation.isPending}
          className="flex items-center gap-2 rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400 disabled:opacity-30"
          title={isSelf ? "You cannot delete your own account" : "Delete user"}
          aria-label="Delete user"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col gap-4">
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
            <label className={labelClass}>New password (leave empty to keep)</label>
            <input
              className={inputClass}
              type="password"
              value={form.password}
              onChange={set("password")}
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
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(event) =>
              setForm((current) => current && { ...current, is_active: event.target.checked })
            }
            className="accent-emerald-500"
          />
          Account active
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className={`${buttonClass} w-auto px-6`}
          >
            {saveMutation.isPending ? "Saving..." : "Save"}
          </button>
          {saved && <span className="text-sm text-emerald-500">Saved.</span>}
        </div>
      </div>
    </form>
  );
}
