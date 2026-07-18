import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";

import {
  connectLastfm,
  disconnectLastfm,
  getScrobbleSettings,
  setListenBrainzToken,
} from "../../api/scrobbling";
import { PageSpinner } from "../../components/Spinner";
import { buttonClass, inputClass } from "../auth/LoginPage";

export function ScrobblingPage() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["scrobble-settings"], queryFn: getScrobbleSettings });

  const [token, setToken] = useState<string | null>(null);
  const [lastfm, setLastfm] = useState({
    api_key: "",
    api_secret: "",
    username: "",
    password: "",
  });
  const [lastfmError, setLastfmError] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data && token === null) {
      setToken(settings.data.listenbrainz_token ?? "");
    }
  }, [settings.data, token]);

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["scrobble-settings"] });

  const tokenMutation = useMutation({
    mutationFn: (value: string) => setListenBrainzToken(value || null),
    onSuccess: invalidate,
  });

  const connectMutation = useMutation({
    mutationFn: connectLastfm,
    onSuccess: () => {
      setLastfm({ api_key: "", api_secret: "", username: "", password: "" });
      setLastfmError(null);
      invalidate();
    },
    onError: (error) =>
      setLastfmError(error instanceof Error ? error.message : "Connection failed."),
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectLastfm,
    onSuccess: invalidate,
  });

  if (settings.isPending || token === null) return <PageSpinner />;
  if (settings.isError) {
    return <p className="text-red-400">Failed to load scrobbling settings.</p>;
  }

  const handleLastfmSubmit = (event: FormEvent) => {
    event.preventDefault();
    connectMutation.mutate(lastfm);
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold">Scrobbling</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Every play recorded in your history is also submitted to the services you connect
        here. Settings are personal to your account.
      </p>

      <div className="mt-6 rounded-lg border border-zinc-800 p-4">
        <p className="text-sm font-medium text-zinc-300">ListenBrainz</p>
        <p className="mt-1 text-xs text-zinc-500">
          Paste your user token from listenbrainz.org/settings. Leave empty to disable.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            className={`${inputClass} flex-1`}
            placeholder="ListenBrainz user token"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
          <button
            type="button"
            onClick={() => tokenMutation.mutate(token.trim())}
            disabled={tokenMutation.isPending}
            className={`${buttonClass} w-auto px-5`}
          >
            Save
          </button>
        </div>
        {tokenMutation.isSuccess && (
          <p className="mt-2 text-sm text-emerald-500">Saved.</p>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-zinc-800 p-4">
        <p className="text-sm font-medium text-zinc-300">Last.fm</p>
        {settings.data.lastfm_connected ? (
          <div className="mt-2 flex items-center gap-3">
            <p className="text-sm text-zinc-400">
              Connected as{" "}
              <span className="font-medium text-zinc-200">
                {settings.data.lastfm_username}
              </span>
              .
            </p>
            <button
              type="button"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <>
            <p className="mt-1 text-xs text-zinc-500">
              Create an API account at last.fm/api/account/create, then connect with your
              Last.fm login. The password is exchanged for a session key and never stored.
            </p>
            <form onSubmit={handleLastfmSubmit} className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                className={inputClass}
                placeholder="API key"
                value={lastfm.api_key}
                onChange={(event) => setLastfm({ ...lastfm, api_key: event.target.value })}
                required
              />
              <input
                className={inputClass}
                placeholder="Shared secret"
                value={lastfm.api_secret}
                onChange={(event) =>
                  setLastfm({ ...lastfm, api_secret: event.target.value })
                }
                required
              />
              <input
                className={inputClass}
                placeholder="Last.fm username"
                value={lastfm.username}
                onChange={(event) => setLastfm({ ...lastfm, username: event.target.value })}
                required
                autoComplete="off"
              />
              <input
                className={inputClass}
                type="password"
                placeholder="Last.fm password"
                value={lastfm.password}
                onChange={(event) => setLastfm({ ...lastfm, password: event.target.value })}
                required
                autoComplete="new-password"
              />
              <button
                type="submit"
                disabled={connectMutation.isPending}
                className={`${buttonClass} w-auto px-6 sm:col-span-2 sm:justify-self-start`}
              >
                {connectMutation.isPending ? "Connecting..." : "Connect"}
              </button>
            </form>
            {lastfmError && <p className="mt-2 text-sm text-red-400">{lastfmError}</p>}
          </>
        )}
      </div>
    </div>
  );
}
