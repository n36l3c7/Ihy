import { api } from "./http";
import type { ScanStatus, Source } from "./types";

export const getSources = () => api<Source[]>("/sources");

export const createSource = (name: string, path: string) =>
  api<Source>("/sources", { method: "POST", body: JSON.stringify({ name, path }) });

export const deleteSource = (id: number) => api<void>(`/sources/${id}`, { method: "DELETE" });

export const getScanStatus = () => api<ScanStatus>("/library/scan");

export const startScan = () => api<ScanStatus>("/library/scan", { method: "POST" });
