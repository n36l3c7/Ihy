import { Disc3 } from "lucide-react";
import { useEffect, useState } from "react";

import { useAuthStore } from "../stores/authStore";

interface CoverImageProps {
  albumId: number | null | undefined;
  className?: string;
  /** Bump to force a reload when the cover changes (bypasses browser cache). */
  cacheKey?: number;
}

export function CoverImage({ albumId, className = "", cacheKey }: CoverImageProps) {
  const token = useAuthStore((state) => state.accessToken);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [albumId, cacheKey]);

  if (!albumId || !token || failed) {
    return (
      <div className={`flex items-center justify-center bg-zinc-800 text-zinc-600 ${className}`}>
        <Disc3 className="h-1/2 w-1/2" />
      </div>
    );
  }
  const version = cacheKey ? `&v=${cacheKey}` : "";
  return (
    <img
      src={`/api/v1/albums/${albumId}/cover?token=${encodeURIComponent(token)}${version}`}
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
      loading="lazy"
      alt=""
    />
  );
}
