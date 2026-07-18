import { type ReactNode, useEffect, useRef, useState } from "react";

import { useImageColor } from "../hooks/useImageColor";

interface GradientHeaderProps {
  imageUrl: string | null;
  children: ReactNode;
  /** Compact bar shown at the top once the hero scrolls out of view. */
  stickyBar: ReactNode;
}

/** Spotify-style detail header: a gradient tinted from the artwork,
 *  plus a sticky compact bar that appears while scrolling. */
export function GradientHeader({ imageUrl, children, stickyBar }: GradientHeaderProps) {
  const color = useImageColor(imageUrl);
  const heroRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div
        className={`sticky top-0 z-20 -mx-8 -mt-6 flex items-center gap-3 border-b border-zinc-800 bg-zinc-950/90 px-8 py-3 backdrop-blur transition-opacity ${
          stuck ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {stickyBar}
      </div>
      <div
        ref={heroRef}
        className="-mx-8 mb-8 px-8 pb-6 pt-6"
        style={{
          marginTop: "-4.25rem",
          paddingTop: "5.75rem",
          background: color
            ? `linear-gradient(to bottom, ${color}, transparent)`
            : undefined,
        }}
      >
        {children}
      </div>
    </>
  );
}
