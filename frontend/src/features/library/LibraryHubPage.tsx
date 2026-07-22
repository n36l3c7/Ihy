import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bookmark,
  ChartColumn,
  CircleDashed,
  Disc3,
  Folder,
  HardDriveDownload,
  Heart,
  History,
  ListMusic,
  LogOut,
  Mic2,
  Music2,
  Plus,
  Radio,
  Settings,
  Sparkles,
  Tags,
} from "lucide-react";
import { Link, useNavigate } from "react-router";

import { getSmartPlaylists } from "../../api/smartPlaylists";
import { createPlaylist, getPlaylists } from "../../api/userLibrary";
import { useAuthStore } from "../../stores/authStore";

const SECTIONS: { to: string; label: string; icon: typeof Music2 }[] = [
  { to: "/tracks", label: "Tracks", icon: Music2 },
  { to: "/artists", label: "Artists", icon: Mic2 },
  { to: "/albums", label: "Albums", icon: Disc3 },
  { to: "/genres", label: "Genres", icon: Tags },
  { to: "/folders", label: "Folders", icon: Folder },
  { to: "/favorites", label: "Liked songs", icon: Heart },
  { to: "/history", label: "Recently played", icon: History },
  { to: "/never-played", label: "Never played", icon: CircleDashed },
  { to: "/bookmarks", label: "Bookmarks", icon: Bookmark },
  { to: "/downloads", label: "Downloads", icon: HardDriveDownload },
  { to: "/stats", label: "Statistics", icon: ChartColumn },
  { to: "/scrobbling", label: "Scrobbling", icon: Radio },
];

/** Mobile entry point to everything the desktop sidebar links to. */
export function LibraryHubPage() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const playlists = useQuery({ queryKey: ["playlists"], queryFn: getPlaylists });
  const smartPlaylists = useQuery({
    queryKey: ["smart-playlists"],
    queryFn: getSmartPlaylists,
  });

  const createMutation = useMutation({
    mutationFn: () => createPlaylist("New playlist"),
    onSuccess: (playlist) => {
      void queryClient.invalidateQueries({ queryKey: ["playlists"] });
      navigate(`/playlists/${playlist.id}`);
    },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your library</h1>
        <div className="flex items-center gap-1">
          {user?.role === "admin" && (
            <Link
              to="/settings"
              className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
              aria-label="Settings"
            >
              <Settings className="h-5 w-5" />
            </Link>
          )}
          <button
            type="button"
            onClick={logout}
            className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Log out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {SECTIONS.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-3 rounded-lg bg-zinc-900 px-4 py-3.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
          >
            <Icon className="h-5 w-5 text-emerald-500" />
            {label}
          </Link>
        ))}
      </div>

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Playlists</h2>
        <button
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          aria-label="Create playlist"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
      {playlists.data?.length ? (
        <ul className="divide-y divide-zinc-800/60">
          {playlists.data.map((playlist) => (
            <li key={playlist.id}>
              <Link
                to={`/playlists/${playlist.id}`}
                className="flex items-center gap-3 py-3 text-sm text-zinc-200 transition-colors hover:text-zinc-100"
              >
                <ListMusic className="h-4 w-4 shrink-0 text-zinc-500" />
                <span className="truncate">{playlist.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-4 text-sm text-zinc-500">No playlists yet.</p>
      )}

      {smartPlaylists.data && smartPlaylists.data.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-lg font-semibold">Smart playlists</h2>
          <ul className="divide-y divide-zinc-800/60">
            {smartPlaylists.data.map((smart) => (
              <li key={smart.id}>
                <Link
                  to={`/smart/${smart.id}`}
                  className="flex items-center gap-3 py-3 text-sm text-zinc-200 transition-colors hover:text-zinc-100"
                >
                  <Sparkles className="h-4 w-4 shrink-0 text-emerald-500" />
                  <span className="truncate">{smart.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
