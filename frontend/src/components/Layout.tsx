import { Disc3, FolderCog, ListMusic, LogOut, Mic2, Music2, Tags } from "lucide-react";
import { NavLink, Outlet } from "react-router";

import { PlayerBar } from "../features/player/PlayerBar";
import { useAuthStore } from "../stores/authStore";

const NAV_ITEMS = [
  { to: "/tracks", label: "Tracks", icon: Music2 },
  { to: "/artists", label: "Artists", icon: Mic2 },
  { to: "/albums", label: "Albums", icon: Disc3 },
  { to: "/genres", label: "Genres", icon: Tags },
];

export function Layout() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-100"
    }`;

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/40 p-4">
          <div className="mb-6 flex items-center gap-2 px-3">
            <ListMusic className="h-6 w-6 text-emerald-500" />
            <span className="text-xl font-bold tracking-tight">Ihy</span>
          </div>
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={linkClass}>
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
            {user?.role === "admin" && (
              <>
                <p className="mb-1 mt-6 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Admin
                </p>
                <NavLink to="/settings/sources" className={linkClass}>
                  <FolderCog className="h-4 w-4" />
                  Sources
                </NavLink>
              </>
            )}
          </nav>
          <div className="mt-auto flex items-center justify-between px-3 pt-4">
            <span className="truncate text-sm text-zinc-400">{user?.username}</span>
            <button
              type="button"
              onClick={logout}
              className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </aside>
        <main className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          <Outlet />
        </main>
      </div>
      <PlayerBar />
    </div>
  );
}
