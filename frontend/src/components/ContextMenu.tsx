import { type ReactNode, useEffect, useRef } from "react";

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
}

export function ContextMenu({ x, y, onClose, children }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  // Keep the menu inside the viewport
  const left = Math.max(4, Math.min(x, window.innerWidth - 240));
  const top = Math.max(4, Math.min(y, window.innerHeight - 320));

  return (
    <div
      ref={ref}
      className="fixed z-50 w-56 rounded-md border border-zinc-800 bg-zinc-900 py-1 shadow-2xl"
      style={{ left, top }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </div>
  );
}

export const contextMenuItemClass =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800";
