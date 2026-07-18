import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";

import { getSpotdlOptions, type SpotdlOptions, updateSpotdlOptions } from "../../../api/downloads";
import { PageSpinner } from "../../../components/Spinner";
import { buttonClass, inputClass } from "../../auth/LoginPage";

const labelClass = "mb-1 block text-xs font-medium text-zinc-400";

interface FormState {
  client_id: string;
  client_secret: string;
  output_format: string;
  bitrate: string;
  threads: string;
  extra_args: string;
}

export function SpotdlSettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [saved, setSaved] = useState(false);

  const query = useQuery({ queryKey: ["spotdl-options"], queryFn: getSpotdlOptions });

  useEffect(() => {
    if (query.data && form === null) {
      setForm({
        client_id: query.data.client_id,
        client_secret: query.data.client_secret,
        output_format: query.data.output_format ?? "",
        bitrate: query.data.bitrate ?? "",
        threads: query.data.threads?.toString() ?? "",
        extra_args: query.data.extra_args,
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

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const threads = Number(form.threads);
    saveMutation.mutate({
      client_id: form.client_id.trim(),
      client_secret: form.client_secret.trim(),
      output_format: (form.output_format || null) as SpotdlOptions["output_format"],
      bitrate: form.bitrate.trim() || null,
      threads: Number.isInteger(threads) && threads > 0 ? threads : null,
      extra_args: form.extra_args.trim(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-lg">
      <div className="mb-6 rounded-lg border border-zinc-800 p-5">
        <p className="mb-1 text-sm font-medium text-zinc-300">Spotify API credentials</p>
        <p className="mb-4 text-xs text-zinc-500">
          Needed for the real-time artist search and passed to spotdl. Create a free app on
          developer.spotify.com to get them.
        </p>
        <div className="flex flex-col gap-4">
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

      <div className="mb-6 rounded-lg border border-zinc-800 p-5">
        <p className="mb-4 text-sm font-medium text-zinc-300">Download options</p>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
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
          <div>
            <label className={labelClass}>
              Extra CLI arguments (any other spotdl flag, space separated)
            </label>
            <input
              className={`${inputClass} font-mono`}
              placeholder="e.g. --sponsor-block --playlist-numbering"
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
