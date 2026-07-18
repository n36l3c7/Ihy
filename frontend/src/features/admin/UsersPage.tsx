import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Trash2, UserPlus } from "lucide-react";
import { type FormEvent, useState } from "react";

import {
  createUser,
  deleteUser,
  getUsers,
  updateUser,
  type UserUpdatePayload,
} from "../../api/admin";
import { ApiError } from "../../api/http";
import { PageSpinner } from "../../components/Spinner";
import { useAuthStore } from "../../stores/authStore";
import { buttonClass, inputClass } from "../auth/LoginPage";

export function UsersPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [error, setError] = useState<string | null>(null);

  const users = useQuery({ queryKey: ["users"], queryFn: getUsers });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["users"] });
  const onError = (err: unknown) =>
    setError(err instanceof ApiError ? err.message : "Operation failed");

  const createMutation = useMutation({
    mutationFn: () =>
      createUser({ username, password, email: email || undefined, role }),
    onSuccess: () => {
      setUsername("");
      setPassword("");
      setEmail("");
      setRole("user");
      setError(null);
      invalidate();
    },
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: UserUpdatePayload }) =>
      updateUser(id, changes),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    createMutation.mutate();
  };

  const handleResetPassword = (id: number, name: string) => {
    const newPassword = window.prompt(`New password for ${name} (min 8 characters):`);
    if (newPassword) updateMutation.mutate({ id, changes: { password: newPassword } });
  };

  const handleDelete = (id: number, name: string) => {
    if (window.confirm(`Delete user "${name}"? Their playlists and favorites are removed.`)) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="max-w-4xl">
      <form onSubmit={handleCreate} className="mb-8 rounded-lg border border-zinc-800 p-4">
        <p className="mb-3 text-sm font-medium text-zinc-300">Add a user</p>
        <div className="flex flex-wrap gap-3">
          <input
            className={`${inputClass} w-40 flex-none`}
            placeholder="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            minLength={3}
          />
          <input
            className={`${inputClass} w-44 flex-none`}
            type="password"
            placeholder="Password (min 8)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
          <input
            className={`${inputClass} w-52 flex-none`}
            type="email"
            placeholder="Email (optional)"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <select
            className={`${inputClass} w-28 flex-none`}
            value={role}
            onChange={(event) => setRole(event.target.value as "admin" | "user")}
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className={`${buttonClass} w-auto px-4`}
          >
            <span className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Add
            </span>
          </button>
        </div>
      </form>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {users.isPending ? (
        <PageSpinner />
      ) : users.isError ? (
        <p className="text-red-400">Failed to load users.</p>
      ) : (
        <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
          {users.data.map((user) => {
            const isSelf = user.id === currentUser?.id;
            return (
              <li key={user.id} className="flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-100">
                    {user.username}
                    {isSelf && <span className="ml-2 text-xs text-emerald-500">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-zinc-500">{user.email ?? "no email"}</p>
                </div>
                <select
                  className={`${inputClass} w-24 flex-none py-1`}
                  value={user.role}
                  onChange={(event) =>
                    updateMutation.mutate({
                      id: user.id,
                      changes: { role: event.target.value as "admin" | "user" },
                    })
                  }
                >
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
                <label className="flex shrink-0 items-center gap-2 text-xs text-zinc-400">
                  <input
                    type="checkbox"
                    checked={user.is_active}
                    onChange={(event) =>
                      updateMutation.mutate({
                        id: user.id,
                        changes: { is_active: event.target.checked },
                      })
                    }
                    className="accent-emerald-500"
                  />
                  active
                </label>
                <button
                  type="button"
                  onClick={() => handleResetPassword(user.id, user.username)}
                  className="shrink-0 rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                  aria-label={`Reset password for ${user.username}`}
                  title="Reset password"
                >
                  <KeyRound className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(user.id, user.username)}
                  disabled={isSelf}
                  className="shrink-0 rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400 disabled:opacity-30"
                  aria-label={`Delete ${user.username}`}
                  title={isSelf ? "You cannot delete your own account" : "Delete user"}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
