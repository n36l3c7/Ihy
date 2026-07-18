import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router";

import { getUsers } from "../../../api/admin";
import { PageSpinner } from "../../../components/Spinner";
import { useAuthStore } from "../../../stores/authStore";

export function UsersListPage() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);
  const users = useQuery({ queryKey: ["users"], queryFn: getUsers });

  if (users.isPending) return <PageSpinner />;
  if (users.isError) return <p className="text-red-400">Failed to load users.</p>;

  return (
    <ul className="max-w-3xl divide-y divide-zinc-800 rounded-lg border border-zinc-800">
      {users.data.map((user) => {
        const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
        return (
          <li key={user.id}>
            <button
              type="button"
              onClick={() => navigate(`/settings/users/${user.id}`)}
              className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-zinc-800/60"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  user.is_active ? "bg-emerald-500" : "bg-zinc-600"
                }`}
                title={user.is_active ? "Active" : "Disabled"}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-zinc-100">
                  {user.username}
                  {user.id === currentUser?.id && (
                    <span className="ml-2 text-xs text-emerald-500">(you)</span>
                  )}
                </span>
                <span className="block truncate text-xs text-zinc-500">
                  {fullName || "—"} · {user.email ?? "no email"}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                  user.role === "admin"
                    ? "bg-emerald-600/20 text-emerald-400"
                    : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {user.role}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
