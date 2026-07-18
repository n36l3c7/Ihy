import { api } from "./http";

export interface ScrobbleSettings {
  listenbrainz_token: string | null;
  lastfm_connected: boolean;
  lastfm_username: string | null;
}

export const getScrobbleSettings = () => api<ScrobbleSettings>("/scrobbling");

export const setListenBrainzToken = (token: string | null) =>
  api<ScrobbleSettings>("/scrobbling/listenbrainz", {
    method: "PUT",
    body: JSON.stringify({ token }),
  });

export interface LastfmConnectPayload {
  api_key: string;
  api_secret: string;
  username: string;
  password: string;
}

export const connectLastfm = (payload: LastfmConnectPayload) =>
  api<ScrobbleSettings>("/scrobbling/lastfm", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const disconnectLastfm = () =>
  api<ScrobbleSettings>("/scrobbling/lastfm", { method: "DELETE" });
