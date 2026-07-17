import { api, ApiError } from "./http";
import type { SetupStatus, TokenPair, User } from "./types";

export async function login(username: string, password: string): Promise<TokenPair> {
  const response = await fetch("/api/v1/auth/login", {
    method: "POST",
    body: new URLSearchParams({ username, password }),
  });
  if (!response.ok) {
    throw new ApiError(response.status, "Invalid username or password");
  }
  return (await response.json()) as TokenPair;
}

export const getSetupStatus = () => api<SetupStatus>("/auth/setup");

export const createFirstAdmin = (username: string, password: string) =>
  api<User>("/auth/setup", { method: "POST", body: JSON.stringify({ username, password }) });

export const getMe = () => api<User>("/auth/me");
