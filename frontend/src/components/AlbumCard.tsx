import { Link } from "react-router";

import { getAlbum } from "../api/catalog";
import type { Album } from "../api/types";
import { usePlayerStore } from "../stores/playerStore";
import { CardPlayButton } from "./CardPlayButton";
import { CoverImage } from "./CoverImage";

/** Compact album card for horizontal shelves (Home / Explore). */
export function AlbumCard({ album }: { album: Album }) {
  const playQueue = usePlayerStore((state) => state.playQueue);

  return (
    <Link
      to={`/albums/${album.id}`}
      className="group w-40 shrink-0 rounded-lg p-3 transition-colors hover:bg-zinc-900"
    >
      <div className="relative">
        <CoverImage albumId={album.id} className="aspect-square w-full rounded-md" />
        <CardPlayButton
          onPlay={() => {
            void getAlbum(album.id).then((detail) => playQueue(detail.tracks));
          }}
        />
      </div>
      <p className="mt-2 truncate text-sm font-medium text-zinc-100">{album.title}</p>
      <p className="truncate text-xs text-zinc-500">{album.artist?.name ?? "Unknown artist"}</p>
    </Link>
  );
}

export function CardShelf({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2 overflow-x-auto pb-2">{children}</div>;
}
