import { Play } from "lucide-react";
import type { MouseEvent } from "react";

/** Spotify-style play button that fades in over a card on hover.
 *  Place inside a `relative` container within a `group` element. */
export function CardPlayButton({ onPlay }: { onPlay: () => void }) {
  const handleClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onPlay();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="absolute bottom-2 right-2 translate-y-1 rounded-full bg-emerald-500 p-3 text-zinc-950 opacity-0 shadow-lg transition-all hover:scale-105 group-hover:translate-y-0 group-hover:opacity-100"
      aria-label="Play"
    >
      <Play className="h-4 w-4 fill-current" />
    </button>
  );
}
