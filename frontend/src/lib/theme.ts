export interface Theme {
  id: string;
  label: string;
  swatch: string; // representative color for the picker
}

/** Themes override Tailwind's color variables (see index.css). */
export const THEMES: Theme[] = [
  { id: "emerald", label: "Emerald", swatch: "#10b981" },
  { id: "violet", label: "Violet", swatch: "#8b5cf6" },
  { id: "blue", label: "Ocean", swatch: "#3b82f6" },
  { id: "rose", label: "Rose", swatch: "#f43f5e" },
  { id: "amber", label: "Amber", swatch: "#f59e0b" },
  { id: "monochrome", label: "Monochrome", swatch: "#fafafa" },
  { id: "neon-nile", label: "Neon Nile", swatch: "#00e5c7" },
  { id: "glitch", label: "Glitch", swatch: "#ffffff" },
];

const STORAGE_KEY = "ihy-theme";

export function applyTheme(id: string): void {
  if (id === "emerald") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = id;
  }
  localStorage.setItem(STORAGE_KEY, id);
}

export function currentTheme(): string {
  return localStorage.getItem(STORAGE_KEY) ?? "emerald";
}

export function initTheme(): void {
  applyTheme(currentTheme());
}
