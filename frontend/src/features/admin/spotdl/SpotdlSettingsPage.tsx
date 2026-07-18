import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";

import { getSpotdlOptions, type SpotdlOptions, updateSpotdlOptions } from "../../../api/downloads";
import { PageSpinner } from "../../../components/Spinner";
import { buttonClass, inputClass } from "../../auth/LoginPage";

const labelClass = "mb-1 block text-xs font-medium text-zinc-400";
const sectionClass = "mb-6 rounded-lg border border-zinc-800 p-5";

interface FormState {
  client_id: string;
  client_secret: string;
  audio_providers: string;
  lyrics_providers: string;
  output_format: string;
  bitrate: string;
  threads: string;
  output_template: string;
  overwrite: string;
  restrict: string;
  max_filename_length: string;
  sponsor_block: boolean;
  playlist_numbering: boolean;
  generate_lrc: boolean;
  print_errors: boolean;
  scan_for_songs: boolean;
  fetch_albums: boolean;
  proxy: string;
  cookie_file: string;
  yt_dlp_args: string;
  extra_args: string;
}

const TOGGLES: { key: keyof FormState; label: string; hint: string }[] = [
  { key: "sponsor_block", label: "SponsorBlock", hint: "skip non-music segments" },
  { key: "playlist_numbering", label: "Playlist numbering", hint: "number tracks in playlists" },
  { key: "generate_lrc", label: "Generate .lrc", hint: "save synced lyrics files" },
  { key: "print_errors", label: "Print errors", hint: "list failed songs at the end" },
  { key: "scan_for_songs", label: "Scan for songs", hint: "detect already-downloaded files" },
  { key: "fetch_albums", label: "Fetch albums", hint: "download full albums of found songs" },
];

export function SpotdlSettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [saved, setSaved] = useState(false);

  const query = useQuery({ queryKey: ["spotdl-options"], queryFn: getSpotdlOptions });

  useEffect(() => {
    if (query.data && form === null) {
      const data = query.data;
      setForm({
        client_id: data.client_id,
        client_secret: data.client_secret,
        audio_providers: data.audio_providers,
        lyrics_providers: data.lyrics_providers,
        output_format: data.output_format ?? "",
        bitrate: data.bitrate ?? "",
        threads: data.threads?.toString() ?? "",
        output_template: data.output_template,
        overwrite: data.overwrite ?? "",
        restrict: data.restrict ?? "",
        max_filename_length: data.max_filename_length?.toString() ?? "",
        sponsor_block: data.sponsor_block,
        playlist_numbering: data.playlist_numbering,
        generate_lrc: data.generate_lrc,
        print_errors: data.print_errors,
        scan_for_songs: data.scan_for_songs,
        fetch_albums: data.fetch_albums,
        proxy: data.proxy,
        cookie_file: data.cookie_file,
        yt_dlp_args: data.yt_dlp_args,
        extra_args: data.extra_args,
      });
    }
  }, [query.data, form]);

  const saveMutation = useMutation({
    mutationFn: (options: SpotdlOptions) => updateSpotdlOptions(options),
    onSuccess: (data) => {
      queryClient.setQueryData(["spotdl-options"], data);
      void queryClient.invalidateQueries({ queryKey: ["spotify-search"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  if (query.isPending || form === null) return <PageSpinner />;
  if (query.isError) return <p className="text-red-400">Failed to load settings.</p>;

  const set =
    (field: keyof FormState) => (event: { target: { value: string } }) =>
      setForm((current) => current && { ...current, [field]: event.target.value });

  const toggle = (field: keyof FormState) => (event: { target: { checked: boolean } }) =>
    setForm((current) => current && { ...current, [field]: event.target.checked });

  const parseOptionalInt = (value: string): number | null => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    saveMutation.mutate({
      client_id: form.client_id.trim(),
      client_secret: form.client_secret.trim(),
      audio_providers: form.audio_providers.trim(),
      lyrics_providers: form.lyrics_providers.trim(),
      output_format: (form.output_format || null) as SpotdlOptions["output_format"],
      bitrate: form.bitrate.trim() || null,
      threads: parseOptionalInt(form.threads),
      output_template: form.output_template.trim(),
      overwrite: (form.overwrite || null) as SpotdlOptions["overwrite"],
      restrict: (form.restrict || null) as SpotdlOptions["restrict"],
      max_filename_length: parseOptionalInt(form.max_filename_length),
      sponsor_block: form.sponsor_block,
      playlist_numbering: form.playlist_numbering,
      generate_lrc: form.generate_lrc,
      print_errors: form.print_errors,
      scan_for_songs: form.scan_for_songs,
      fetch_albums: form.fetch_albums,
      proxy: form.proxy.trim(),
      cookie_file: form.cookie_file.trim(),
      yt_dlp_args: form.yt_dlp_args.trim(),
      extra_args: form.extra_args.trim(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      <div className={sectionClass}>
        <p className="mb-1 text-sm font-medium text-zinc-300">Spotify API credentials</p>
        <p className="mb-4 text-xs text-zinc-500">
          Used for the real-time artist search and passed to spotdl. Requires a (Premium)
          account on developer.spotify.com. Without them, add watches by pasting URLs.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Client ID</label>
            <input className={inputClass} value={form.client_id} onChange={set("client_id")} />
          </div>
          <div>
            <label className={labelClass}>Client secret</label>
            <input
              className={inputClass}
              type="password"
              value={form.client_secret}
              onChange={set("client_secret")}
            />
          </div>
        </div>
      </div>

      <div className={sectionClass}>
        <p className="mb-4 text-sm font-medium text-zinc-300">Providers</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Audio providers (space separated)</label>
            <input
              className={`${inputClass} font-mono`}
              placeholder="e.g. youtube-music youtube"
              value={form.audio_providers}
              onChange={set("audio_providers")}
            />
          </div>
          <div>
            <label className={labelClass}>Lyrics providers (space separated)</label>
            <input
              className={`${inputClass} font-mono`}
              placeholder="e.g. genius synced musixmatch"
              value={form.lyrics_providers}
              onChange={set("lyrics_providers")}
            />
          </div>
        </div>
      </div>

      <div className={sectionClass}>
        <p className="mb-4 text-sm font-medium text-zinc-300">Output</p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Format</label>
            <select
              className={inputClass}
              value={form.output_format}
              onChange={set("output_format")}
            >
              <option value="">spotdl default</option>
              <option value="mp3">mp3</option>
              <option value="flac">flac</option>
              <option value="ogg">ogg</option>
              <option value="opus">opus</option>
              <option value="m4a">m4a</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Bitrate</label>
            <input
              className={inputClass}
              placeholder="e.g. 320k"
              value={form.bitrate}
              onChange={set("bitrate")}
            />
          </div>
          <div>
            <label className={labelClass}>Threads</label>
            <input
              className={inputClass}
              inputMode="numeric"
              placeholder="default"
              value={form.threads}
              onChange={set("threads")}
            />
          </div>
        </div>
        <div className="mt-4">
          <label className={labelClass}>
            Output template (relative to the source folder)
          </label>
          <input
            className={`${inputClass} font-mono`}
            placeholder="{artist}/{album}/{title}.{output-ext}"
            value={form.output_template}
            onChange={set("output_template")}
          />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Overwrite mode</label>
            <select className={inputClass} value={form.overwrite} onChange={set("overwrite")}>
              <option value="">default (skip)</option>
              <option value="skip">skip</option>
              <option value="metadata">metadata</option>
              <option value="force">force</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Filename restrictions</label>
            <select className={inputClass} value={form.restrict} onChange={set("restrict")}>
              <option value="">none</option>
              <option value="strict">strict</option>
              <option value="ascii">ascii</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Max filename length</label>
            <input
              className={inputClass}
              inputMode="numeric"
              placeholder="default"
              value={form.max_filename_length}
              onChange={set("max_filename_length")}
            />
          </div>
        </div>
      </div>

      <div className={sectionClass}>
        <p className="mb-4 text-sm font-medium text-zinc-300">Behavior</p>
        <div className="grid grid-cols-2 gap-3">
          {TOGGLES.map(({ key, label, hint }) => (
            <label key={key} className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={form[key] as boolean}
                onChange={toggle(key)}
                className="accent-emerald-500"
              />
              {label}
              <span className="text-xs text-zinc-500">— {hint}</span>
            </label>
          ))}
        </div>
      </div>

      <div className={sectionClass}>
        <p className="mb-4 text-sm font-medium text-zinc-300">Network & advanced</p>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Proxy</label>
              <input
                className={`${inputClass} font-mono`}
                placeholder="e.g. http://host:3128"
                value={form.proxy}
                onChange={set("proxy")}
              />
            </div>
            <div>
              <label className={labelClass}>Cookie file path</label>
              <input
                className={`${inputClass} font-mono`}
                placeholder="/data/cookies.txt"
                value={form.cookie_file}
                onChange={set("cookie_file")}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>yt-dlp arguments</label>
            <input
              className={`${inputClass} font-mono`}
              placeholder='e.g. "--format-sort ext"'
              value={form.yt_dlp_args}
              onChange={set("yt_dlp_args")}
            />
          </div>
          <div>
            <label className={labelClass}>
              Extra spotdl CLI arguments (anything not covered above)
            </label>
            <input
              className={`${inputClass} font-mono`}
              placeholder="e.g. --add-unavailable --ignore-albums"
              value={form.extra_args}
              onChange={set("extra_args")}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saveMutation.isPending}
          className={`${buttonClass} w-auto px-6`}
        >
          {saveMutation.isPending ? "Saving..." : "Save"}
        </button>
        {saved && <span className="text-sm text-emerald-500">Saved.</span>}
        {saveMutation.isError && <span className="text-sm text-red-400">Failed to save.</span>}
      </div>
    </form>
  );
}
