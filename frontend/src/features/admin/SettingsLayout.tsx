import { DownloadCloud, FolderCog, SlidersHorizontal, Users } from "lucide-react";
import { Navigate, NavLink, Outlet } from "react-router";

import { useAuthStore } from "../../stores/authStore";

const SETTINGS_NAV = [
  { to: "/settings/sources", label: "Sources", icon: FolderCog },
  { to: "/settings/library", label: "Library", icon: SlidersHorizontal },
  { to: "/settings/users", label: "Users", icon: Users },
  { to: "/settings/spotdl", label: "SpotDL", icon: DownloadCloud },
];

export function SettingsLayout() {
  const user = useAuthStore((state) => state.user);
  if (user?.role !== "admin") return <Navigate to="/tracks" replace />;

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-100"
    }`;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>
      <div className="flex gap-8">
        <aside className="flex w-44 shrink-0 flex-col gap-1">
          {SETTINGS_NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={linkClass}>
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </aside>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
