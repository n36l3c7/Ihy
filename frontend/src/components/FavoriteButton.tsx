import { Heart } from "lucide-react";
import type { MouseEvent } from "react";

import { useFavorites } from "../hooks/useFavorites";

export function FavoriteButton({ trackId }: { trackId: number }) {
  const { isFavorite, toggle } = useFavorites();
  const favorite = isFavorite(trackId);

  const handleClick = (event: MouseEvent) => {
    event.stopPropagation();
    toggle(trackId);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded-full p-1.5 transition-colors hover:bg-zinc-700/50"
      aria-label={favorite ? "Remove from liked songs" : "Add to liked songs"}
    >
      <Heart
        className={`h-4 w-4 ${
          favorite ? "fill-emerald-500 text-emerald-500" : "text-zinc-500 hover:text-zinc-200"
        }`}
      />
    </button>
  );
}
