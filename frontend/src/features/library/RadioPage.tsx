import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Play, Plus, RadioTower, Square, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { api } from "../../api/http";
import { useAuthStore } from "../../stores/authStore";
import { usePlayerStore } from "../../stores/playerStore";

interface Station {
  id: number;
  name: string;
  stream_url: string;
  homepage_url: string | null;
}

const getStations = () => api<Station[]>("/radio-stations");

export function RadioPage() {
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((state) => state.user?.role === "admin");
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stations = useQuery({ queryKey: ["radio-stations"], queryFn: getStations });

  const createMutation = useMutation({
    mutationFn: () =>
      api<Station>("/radio-stations", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), stream_url: url.trim() }),
      }),
    onSuccess: () => {
      setName("");
      setUrl("");
      void queryClient.invalidateQueries({ queryKey: ["radio-stations"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api<void>(`/radio-stations/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["radio-stations"] }),
  });

  // One dedicated audio element for streams; stop it when leaving the page
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.removeAttribute("src");
    };
  }, []);

  const stop = () => {
    audioRef.current?.pause();
    setPlayingId(null);
  };

  const play = (station: Station) => {
    const audio = audioRef.current;
    if (!audio) return;
    // Radio replaces library playback: pause the main player
    usePlayerStore.getState().setPlaying(false);
    audio.src = station.stream_url;
    void audio.play().catch(() => setPlayingId(null));
    setPlayingId(station.id);
  };

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() && url.trim()) createMutation.mutate();
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <RadioTower className="h-7 w-7 text-emerald-500" />
        <div>
          <h1 className="text-2xl font-bold">Internet radio</h1>
          <p className="text-sm text-zinc-400">
            Live streams next to your library — also visible to Subsonic apps.
          </p>
        </div>
      </div>

      {stations.data?.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-500">
          No stations yet{isAdmin ? " — add the first one below." : "."}
        </p>
      )}
      <ul className="divide-y divide-zinc-800/60">
        {stations.data?.map((station) => (
          <li key={station.id} className="flex items-center gap-3 py-3">
            <button
              type="button"
              onClick={() => (playingId === station.id ? stop() : play(station))}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
                playingId === station.id
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-800 text-zinc-300 hover:bg-emerald-600 hover:text-white"
              }`}
              aria-label={playingId === station.id ? "Stop" : `Play ${station.name}`}
            >
              {playingId === station.id ? (
                <Square className="h-4 w-4 fill-current" />
              ) : (
                <Play className="h-4 w-4 translate-x-px fill-current" />
              )}
            </button>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-zinc-100">
                {station.name}
                {playingId === station.id && (
                  <span className="ml-2 text-xs text-emerald-500">on air</span>
                )}
              </span>
              <span className="block truncate text-xs text-zinc-500">
                {station.stream_url}
              </span>
            </span>
            {station.homepage_url && (
              <a
                href={station.homepage_url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                aria-label="Station homepage"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  if (playingId === station.id) stop();
                  deleteMutation.mutate(station.id);
                }}
                className="shrink-0 rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
                aria-label={`Delete ${station.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {isAdmin && (
        <form
          onSubmit={handleCreate}
          className="mt-8 rounded-lg border border-zinc-800 p-4"
        >
          <p className="mb-3 text-sm font-medium text-zinc-300">Add a station</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name"
              maxLength={100}
              className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-600 sm:w-56"
            />
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://stream.example/radio.mp3"
              className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-600"
            />
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
          {createMutation.isError && (
            <p className="mt-2 text-sm text-red-400">Could not add the station.</p>
          )}
        </form>
      )}
    </div>
  );
}
