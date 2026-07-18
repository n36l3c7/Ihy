import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bookmark,
  ChartColumn,
  Compass,
  Disc3,
  Folder,
  Heart,
  History,
  House,
  Library,
  ListMusic,
  LogOut,
  Mic2,
  Music2,
  Palette,
  Play,
  Plus,
  Radio,
  Search,
  Settings,
  Sparkles,
  Tags,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";

import { createSmartPlaylist, getSmartPlaylists } from "../api/smartPlaylists";
import type { Playlist } from "../api/types";
import {
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  getPlaylists,
  importPlaylistFile,
} from "../api/userLibrary";
import { SmartPlaylistDialog } from "../features/playlists/SmartPlaylistDialog";
import { PlayerBar } from "../features/player/PlayerBar";
import { QueuePanel } from "../features/player/QueuePanel";
import { seekRelative } from "../lib/playerControls";
import { initPlayerSync } from "../lib/playerSync";
import { initSessionPersistence, restoreSession } from "../lib/session";
import { applyTheme, currentTheme, THEMES } from "../lib/theme";
import { useAuthStore } from "../stores/authStore";
import { usePlayerStore } from "../stores/playerStore";
import { CommandPalette } from "./CommandPalette";
import { ContextMenu, contextMenuItemClass } from "./ContextMenu";

const LIBRARY_ITEMS = [
  { to: "/home", label: "Home", icon: House },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/tracks", label: "Tracks", icon: Music2 },
  { to: "/artists", label: "Artists", icon: Mic2 },
  { to: "/albums", label: "Albums", icon: Disc3 },
  { to: "/genres", label: "Genres", icon: Tags },
  { to: "/folders", label: "Folders", icon: Folder },
];

const PERSONAL_ITEMS = [
  { to: "/favorites", label: "Liked songs", icon: Heart },
  { to: "/history", label: "Recently played", icon: History },
  { to: "/bookmarks", label: "Bookmarks", icon: Bookmark },
  { to: "/stats", label: "Statistics", icon: ChartColumn },
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
  const [themeOpen, setThemeOpen] = useState(false);
  const [theme, setTheme] = useState(currentTheme);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [smartDialogOpen, setSmartDialogOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const playlists = useQuery({ queryKey: ["playlists"], queryFn: getPlaylists });
  const smartPlaylists = useQuery({
    queryKey: ["smart-playlists"],
    queryFn: getSmartPlaylists,
  });

  // Cross-tab sync first, then resume the last session unless another
  // tab is already playing (its state arrives within the handshake delay)
  useEffect(() => {
    initPlayerSync();
    initSessionPersistence();
    const timer = setTimeout(() => void restoreSession(), 800);
    return () => clearTimeout(timer);
  }, []);

  // Global shortcuts: Ctrl+K palette, Space play/pause, arrows seek/volume
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }
      const store = usePlayerStore.getState();
      switch (event.key) {
        case " ":
          event.preventDefault();
          store.togglePlay();
          break;
        case "ArrowRight":
          event.preventDefault();
          seekRelative(5);
          break;
        case "ArrowLeft":
          event.preventDefault();
          seekRelative(-5);
          break;
        case "ArrowUp":
          event.preventDefault();
          store.setVolume(Math.min(1, store.volume + 0.05));
          break;
        case "ArrowDown":
          event.preventDefault();
          store.setVolume(Math.max(0, store.volume - 0.05));
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleImportFile = async (file: File) => {
    try {
      const result = await importPlaylistFile(file);
      void queryClient.invalidateQueries({ queryKey: ["playlists"] });
      navigate(`/playlists/${result.playlist.id}`);
      if (result.matched < result.total) {
        window.alert(`Imported "${result.playlist.name}": ${result.matched}/${result.total} tracks matched.`);
      }
    } catch {
      window.alert("Could not import the playlist file.");
    }
  };

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
        <aside className="hidden w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/40 p-4 md:flex">
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
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                  className="rounded-full p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                  aria-label="Import playlist"
                  title="Import M3U/XSPF playlist"
                >
                  <Upload className="h-4 w-4" />
                </button>
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
              <input
                ref={importInputRef}
                type="file"
                accept=".m3u,.m3u8,.xspf"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void handleImportFile(file);
                }}
              />
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
            <div className="mb-1 mt-5 flex items-center justify-between px-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Smart playlists
              </p>
              <button
                type="button"
                onClick={() => setSmartDialogOpen(true)}
                className="rounded-full p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                aria-label="Create smart playlist"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {smartPlaylists.data?.map((smart) => (
              <NavLink key={smart.id} to={`/smart/${smart.id}`} className={linkClass}>
                <Sparkles className="h-4 w-4 shrink-0" />
                <span className="truncate">{smart.name}</span>
              </NavLink>
            ))}
            <NavLink to="/scrobbling" className={`${linkClass({ isActive: false })} mt-5`}>
              <Radio className="h-4 w-4" />
              Scrobbling
            </NavLink>
            {user?.role === "admin" && (
              <NavLink to="/settings" className={linkClass({ isActive: false })}>
                <Settings className="h-4 w-4" />
                Settings
              </NavLink>
            )}
          </nav>
          <div className="relative mt-auto flex items-center justify-between px-3 pt-4">
            <span className="truncate text-sm text-zinc-400">{user?.username}</span>
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setThemeOpen((open) => !open)}
                className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                aria-label="Theme"
              >
                <Palette className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={logout}
                className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                aria-label="Log out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
            {themeOpen && (
              <div className="absolute bottom-full right-0 z-30 mb-2 w-44 rounded-md border border-zinc-800 bg-zinc-900 py-1 shadow-2xl">
                {THEMES.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      applyTheme(entry.id);
                      setTheme(entry.id);
                      setThemeOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
                  >
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: entry.swatch }}
                    />
                    {entry.label}
                    {theme === entry.id && <span className="ml-auto text-emerald-500">●</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6">
          <Outlet />
        </main>
        {queueOpen && <QueuePanel />}
      </div>
      <PlayerBar />
      <nav className="flex items-stretch justify-around border-t border-zinc-800 bg-zinc-900 md:hidden">
        {[
          { to: "/home", label: "Home", icon: House },
          { to: "/explore", label: "Explore", icon: Compass },
          { to: "/library", label: "Library", icon: Library },
        ].map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                isActive ? "text-emerald-500" : "text-zinc-400"
              }`
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-zinc-400"
        >
          <Search className="h-5 w-5" />
          Search
        </button>
      </nav>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {smartDialogOpen && (
        <SmartPlaylistDialog
          onSave={async (payload) => {
            const created = await createSmartPlaylist(payload);
            void queryClient.invalidateQueries({ queryKey: ["smart-playlists"] });
            navigate(`/smart/${created.id}`);
          }}
          onClose={() => setSmartDialogOpen(false)}
        />
      )}
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
