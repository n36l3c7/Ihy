import { Mic2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useAuthStore } from "../stores/authStore";

interface ArtistImageProps {
  artistId: number | null | undefined;
  className?: string;
  cacheKey?: number;
}

export function ArtistImage({ artistId, className = "", cacheKey }: ArtistImageProps) {
  const token = useAuthStore((state) => state.accessToken);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [artistId, cacheKey]);

  if (!artistId || !token || failed) {
    return (
      <div className={`flex items-center justify-center bg-zinc-800 text-zinc-600 ${className}`}>
        <Mic2 className="h-1/2 w-1/2" />
      </div>
    );
  }
  const version = cacheKey ? `&v=${cacheKey}` : "";
  return (
    <img
      src={`/api/v1/artists/${artistId}/image?token=${encodeURIComponent(token)}${version}`}
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
      loading="lazy"
      alt=""
    />
  );
}
