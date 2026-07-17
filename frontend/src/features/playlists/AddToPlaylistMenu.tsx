import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListPlus } from "lucide-react";
import { type MouseEvent, useEffect, useRef, useState } from "react";

import { addTrackToPlaylist, getPlaylists } from "../../api/userLibrary";

export function AddToPlaylistMenu({ trackId }: { trackId: number }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const playlists = useQuery({
    queryKey: ["playlists"],
    queryFn: getPlaylists,
    enabled: open,
  });

  const addMutation = useMutation({
    mutationFn: (playlistId: number) => addTrackToPlaylist(playlistId, trackId),
    onSuccess: (_item, playlistId) => {
      void queryClient.invalidateQueries({ queryKey: ["playlists"] });
      void queryClient.invalidateQueries({ queryKey: ["playlist", String(playlistId)] });
      setOpen(false);
    },
  });

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: globalThis.MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const handleToggle = (event: MouseEvent) => {
    event.stopPropagation();
    setOpen((value) => !value);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={handleToggle}
        className="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700/50 hover:text-zinc-200"
        aria-label="Add to playlist"
      >
        <ListPlus className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-zinc-800 bg-zinc-900 py-1 shadow-xl"
          onClick={(event) => event.stopPropagation()}
        >
          <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Add to playlist
          </p>
          {playlists.data?.length ? (
            playlists.data.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                onClick={() => addMutation.mutate(playlist.id)}
                className="block w-full truncate px-3 py-1.5 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
              >
                {playlist.name}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-xs text-zinc-500">No playlists yet</p>
          )}
        </div>
      )}
    </div>
  );
}
