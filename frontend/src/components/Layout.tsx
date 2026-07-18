import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Disc3,
  Heart,
  History,
  ListMusic,
  LogOut,
  Mic2,
  Music2,
  Play,
  Plus,
  Settings,
  Tags,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";

import type { Playlist } from "../api/types";
import { createPlaylist, deletePlaylist, getPlaylist, getPlaylists } from "../api/userLibrary";
import { PlayerBar } from "../features/player/PlayerBar";
import { QueuePanel } from "../features/player/QueuePanel";
import { useAuthStore } from "../stores/authStore";
import { usePlayerStore } from "../stores/playerStore";
import { ContextMenu, contextMenuItemClass } from "./ContextMenu";

const LIBRARY_ITEMS = [
  { to: "/tracks", label: "Tracks", icon: Music2 },
  { to: "/artists", label: "Artists", icon: Mic2 },
  { to: "/albums", label: "Albums", icon: Disc3 },
  { to: "/genres", label: "Genres", icon: Tags },
];

const PERSONAL_ITEMS = [
  { to: "/favorites", label: "Liked songs", icon: Heart },
  { to: "/history", label: "Recently played", icon: History },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-100"
  }`;

export function Layout() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const playQueue = usePlayerStore((state) => state.playQueue);
  const queueOpen = usePlayerStore((state) => state.queueOpen);
  const [menu, setMenu] = useState<{ x: number; y: number; playlist: Playlist } | null>(null);

  const playlists = useQuery({ queryKey: ["playlists"], queryFn: getPlaylists });

  const createMutation = useMutation({
    mutationFn: () => createPlaylist("New playlist"),
    onSuccess: (playlist) => {
      void queryClient.invalidateQueries({ queryKey: ["playlists"] });
      navigate(`/playlists/${playlist.id}`);
    },
  });

  const playPlaylist = async (playlist: Playlist) => {
    const detail = await getPlaylist(playlist.id);
    playQueue(detail.items.map((item) => item.track));
  };

  const handleDeletePlaylist = async (playlist: Playlist) => {
    if (!window.confirm(`Delete playlist "${playlist.name}"?`)) return;
    await deletePlaylist(playlist.id);
    void queryClient.invalidateQueries({ queryKey: ["playlists"] });
    if (location.pathname === `/playlists/${playlist.id}`) navigate("/tracks");
  };

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/40 p-4">
          <div className="mb-6 flex items-center gap-2 px-3">
            <ListMusic className="h-6 w-6 text-emerald-500" />
            <span className="text-xl font-bold tracking-tight">Ihy</span>
          </div>
          <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {LIBRARY_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={linkClass}>
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
            <p className="mb-1 mt-5 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Your library
            </p>
            {PERSONAL_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={linkClass}>
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
            <div className="mb-1 mt-5 flex items-center justify-between px-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Playlists
              </p>
              <button
                type="button"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="rounded-full p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                aria-label="Create playlist"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {playlists.data?.map((playlist) => (
              <NavLink
                key={playlist.id}
                to={`/playlists/${playlist.id}`}
                className={linkClass}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenu({ x: event.clientX, y: event.clientY, playlist });
                }}
              >
                <ListMusic className="h-4 w-4 shrink-0" />
                <span className="truncate">{playlist.name}</span>
              </NavLink>
            ))}
            {user?.role === "admin" && (
              <NavLink to="/settings" className={`${linkClass({ isActive: false })} mt-5`}>
                <Settings className="h-4 w-4" />
                Settings
              </NavLink>
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
        {queueOpen && <QueuePanel />}
      </div>
      <PlayerBar />
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <button
            type="button"
            className={contextMenuItemClass}
            onClick={() => {
              void playPlaylist(menu.playlist);
              setMenu(null);
            }}
          >
            <Play className="h-4 w-4" />
            Play
          </button>
          <button
            type="button"
            className={`${contextMenuItemClass} text-red-400 hover:text-red-300`}
            onClick={() => {
              void handleDeletePlaylist(menu.playlist);
              setMenu(null);
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete playlist
          </button>
        </ContextMenu>
      )}
    </div>
  );
}
