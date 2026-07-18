import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Disc3, Mic2, Music2, Navigation, Play, Search } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";

import { getAlbums, getArtists, getTracks } from "../api/catalog";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { usePlayerStore } from "../stores/playerStore";

interface PaletteItem {
  id: string;
  label: string;
  hint: string;
  icon: ReactNode;
  run: () => void;
}

const PAGES: { label: string; to: string }[] = [
  { label: "Home", to: "/home" },
  { label: "Explore", to: "/explore" },
  { label: "Tracks", to: "/tracks" },
  { label: "Artists", to: "/artists" },
  { label: "Albums", to: "/albums" },
  { label: "Genres", to: "/genres" },
  { label: "Folders", to: "/folders" },
  { label: "Radio", to: "/radio" },
  { label: "Wrapped", to: "/wrapped" },
  { label: "Liked songs", to: "/favorites" },
  { label: "Recently played", to: "/history" },
  { label: "Bookmarks", to: "/bookmarks" },
  { label: "Statistics", to: "/stats" },
  { label: "Settings", to: "/settings" },
];

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const debounced = useDebouncedValue(query, 250);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const search = useQuery({
    queryKey: ["palette-search", debounced],
    queryFn: async () => {
      const [tracks, artists, albums] = await Promise.all([
        getTracks({ q: debounced, limit: 4 }),
        getArtists({ q: debounced, limit: 3 }),
        getAlbums({ q: debounced, limit: 3 }),
      ]);
      return { tracks: tracks.items, artists: artists.items, albums: albums.items };
    },
    enabled: debounced.trim().length >= 2,
    placeholderData: keepPreviousData,
  });

  const items = useMemo<PaletteItem[]>(() => {
    const store = usePlayerStore.getState();
    const result: PaletteItem[] = [];
    const lower = query.trim().toLowerCase();

    const actions: PaletteItem[] = [
      {
        id: "action-toggle",
        label: store.isPlaying ? "Pause" : "Play",
        hint: "Player",
        icon: <Play className="h-4 w-4" />,
        run: () => store.togglePlay(),
      },
      {
        id: "action-next",
        label: "Next track",
        hint: "Player",
        icon: <Play className="h-4 w-4" />,
        run: () => store.next(),
      },
      {
        id: "action-queue",
        label: "Toggle queue panel",
        hint: "Player",
        icon: <Play className="h-4 w-4" />,
        run: () => store.toggleQueueOpen(),
      },
    ];
    for (const page of PAGES) {
      actions.push({
        id: `page-${page.to}`,
        label: `Go to ${page.label}`,
        hint: "Navigate",
        icon: <Navigation className="h-4 w-4" />,
        run: () => navigate(page.to),
      });
    }
    result.push(
      ...actions.filter((item) => !lower || item.label.toLowerCase().includes(lower)),
    );

    if (search.data && debounced.trim().length >= 2) {
      for (const track of search.data.tracks) {
        result.push({
          id: `track-${track.id}`,
          label: track.title,
          hint: `Track — ${track.artists.map((a) => a.name).join(", ") || "Unknown"}`,
          icon: <Music2 className="h-4 w-4" />,
          run: () => usePlayerStore.getState().playQueue([track]),
        });
      }
      for (const artist of search.data.artists) {
        result.push({
          id: `artist-${artist.id}`,
          label: artist.name,
          hint: "Artist",
          icon: <Mic2 className="h-4 w-4" />,
          run: () => navigate(`/artists/${artist.id}`),
        });
      }
      for (const album of search.data.albums) {
        result.push({
          id: `album-${album.id}`,
          label: album.title,
          hint: `Album — ${album.artist?.name ?? "Unknown"}`,
          icon: <Disc3 className="h-4 w-4" />,
          run: () => navigate(`/albums/${album.id}`),
        });
      }
    }
    return result.slice(0, 12);
  }, [query, debounced, search.data, navigate]);

  useEffect(() => setSelected(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const runItem = (item: PaletteItem) => {
    item.run();
    onClose();
  };

  const handleKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "Escape") onClose();
    else if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((index) => Math.min(index + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && items[selected]) {
      runItem(items[selected]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/60 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="h-fit w-full max-w-xl rounded-lg border border-zinc-800 bg-zinc-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tracks, artists, albums or type a command..."
            className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none"
          />
          <kbd className="shrink-0 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-500">
            ESC
          </kbd>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-zinc-500">No results.</p>
          ) : (
            items.map((item, index) => (
              <button
                key={item.id}
                data-index={index}
                type="button"
                onClick={() => runItem(item)}
                onMouseEnter={() => setSelected(index)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
                  index === selected ? "bg-zinc-800 text-zinc-100" : "text-zinc-300"
                }`}
              >
                <span className="text-zinc-500">{item.icon}</span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <span className="shrink-0 text-xs text-zinc-500">{item.hint}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
