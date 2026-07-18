import { useEffect, useState } from "react";

/** Average color of an image (same-origin), for Spotify-style gradients. */
export function useImageColor(url: string | null): string | null {
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    setColor(null);
    if (!url) return;
    let cancelled = false;
    const image = new Image();
    image.src = url;
    image.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 8;
        canvas.height = 8;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.drawImage(image, 0, 0, 8, 8);
        const data = context.getImageData(0, 0, 8, 8).data;
        let r = 0;
        let g = 0;
        let b = 0;
        const pixels = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
        }
        // Darken slightly so white text stays readable
        const scale = 0.6;
        setColor(
          `rgb(${Math.round((r / pixels) * scale)} ${Math.round((g / pixels) * scale)} ${Math.round(
            (b / pixels) * scale,
          )})`,
        );
      } catch {
        // canvas unavailable or tainted — keep the default background
      }
    };
    return () => {
      cancelled = true;
    };
  }, [url]);

  return color;
}
