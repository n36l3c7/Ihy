import { LayoutGrid, List } from "lucide-react";
import { useEffect, useState } from "react";

export type ViewMode = "grid" | "list";

export function useViewMode(storageKey: string): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() =>
    localStorage.getItem(storageKey) === "list" ? "list" : "grid",
  );
  useEffect(() => {
    localStorage.setItem(storageKey, mode);
  }, [storageKey, mode]);
  return [mode, setMode];
}

export function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const buttonClass = (active: boolean) =>
    `rounded-md p-2 transition-colors ${
      active ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-100"
    }`;

  return (
    <div className="flex gap-1 rounded-md border border-zinc-800 p-0.5">
      <button
        type="button"
        onClick={() => onChange("grid")}
        className={buttonClass(view === "grid")}
        aria-label="Grid view"
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onChange("list")}
        className={buttonClass(view === "list")}
        aria-label="List view"
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  );
}
