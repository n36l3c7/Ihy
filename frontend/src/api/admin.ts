import { api } from "./http";
import type { LibrarySettings, ScanStatus, Source, User } from "./types";

export const getSources = () => api<Source[]>("/sources");

export const createSource = (name: string, path: string) =>
  api<Source>("/sources", { method: "POST", body: JSON.stringify({ name, path }) });

export const deleteSource = (id: number) => api<void>(`/sources/${id}`, { method: "DELETE" });

export const getScanStatus = () => api<ScanStatus>("/library/scan");

export const startScan = (full = false) =>
  api<ScanStatus>(`/library/scan${full ? "?full=true" : ""}`, { method: "POST" });

export interface UserCreatePayload {
  username: string;
  password: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  role?: "admin" | "user";
}

export interface UserUpdatePayload {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  password?: string;
  role?: "admin" | "user";
  is_active?: boolean;
}

export const getUsers = () => api<User[]>("/users");

export const getUser = (id: number) => api<User>(`/users/${id}`);

export const createUser = (payload: UserCreatePayload) =>
  api<User>("/users", { method: "POST", body: JSON.stringify(payload) });

export const updateUser = (id: number, changes: UserUpdatePayload) =>
  api<User>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(changes) });

export const deleteUser = (id: number) => api<void>(`/users/${id}`, { method: "DELETE" });

export interface BackupImportSummary {
  sections: Record<string, { created: number; updated: number; skipped: number }>;
}

export const exportBackup = (sections: string[]) =>
  api<Record<string, unknown>>(`/settings/backup?sections=${sections.join(",")}`);

export const importBackup = (sections: string[], data: unknown) =>
  api<BackupImportSummary>("/settings/backup", {
    method: "POST",
    body: JSON.stringify({ sections, data }),
  });

export const getLibrarySettings = () => api<LibrarySettings>("/settings/library");

export const updateLibrarySettings = (settings: LibrarySettings) =>
  api<LibrarySettings>("/settings/library", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
