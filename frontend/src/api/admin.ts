import { api } from "./http";
import type { LibrarySettings, ScanStatus, Source } from "./types";

export const getSources = () => api<Source[]>("/sources");

export const createSource = (name: string, path: string) =>
  api<Source>("/sources", { method: "POST", body: JSON.stringify({ name, path }) });

export const deleteSource = (id: number) => api<void>(`/sources/${id}`, { method: "DELETE" });

export const getScanStatus = () => api<ScanStatus>("/library/scan");

export const startScan = (full = false) =>
  api<ScanStatus>(`/library/scan${full ? "?full=true" : ""}`, { method: "POST" });

export const getLibrarySettings = () => api<LibrarySettings>("/settings/library");

export const updateLibrarySettings = (settings: LibrarySettings) =>
  api<LibrarySettings>("/settings/library", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
