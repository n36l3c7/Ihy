import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListPlus } from "lucide-react";
import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";

import { addTrackToPlaylist, getPlaylists } from "../../api/userLibrary";

interface PlaylistDropdownProps {
  buttonContent: ReactNode;
  buttonClassName: string;
  ariaLabel: string;
  onPick: (playlistId: number) => void;
}

/** A button opening a dropdown with the user's playlists. */
export function PlaylistDropdown({
  buttonContent,
  buttonClassName,
  ariaLabel,
  onPick,
}: PlaylistDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const playlists = useQuery({
    queryKey: ["playlists"],
    queryFn: getPlaylists,
    enabled: open,
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
      <button type="button" onClick={handleToggle} className={buttonClassName} aria-label={ariaLabel}>
        {buttonContent}
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
                onClick={() => {
                  onPick(playlist.id);
                  setOpen(false);
                }}
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

export function AddToPlaylistMenu({ trackId }: { trackId: number }) {
  const queryClient = useQueryClient();

  const addMutation = useMutation({
    mutationFn: (playlistId: number) => addTrackToPlaylist(playlistId, trackId),
    onSuccess: (_item, playlistId) => {
      void queryClient.invalidateQueries({ queryKey: ["playlists"] });
      void queryClient.invalidateQueries({ queryKey: ["playlist", String(playlistId)] });
    },
  });

  return (
    <PlaylistDropdown
      buttonContent={<ListPlus className="h-4 w-4" />}
      buttonClassName="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700/50 hover:text-zinc-200"
      ariaLabel="Add to playlist"
      onPick={(playlistId) => addMutation.mutate(playlistId)}
    />
  );
}
