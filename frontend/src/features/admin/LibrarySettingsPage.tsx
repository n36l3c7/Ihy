import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import {
  getLibrarySettings,
  getLoudnessStatus,
  startLoudnessAnalysis,
  startScan,
  updateLibrarySettings,
} from "../../api/admin";
import { PageSpinner } from "../../components/Spinner";
import { buttonClass, inputClass } from "../auth/LoginPage";

export function LibrarySettingsPage() {
  const queryClient = useQueryClient();
  const [separators, setSeparators] = useState<string[] | null>(null);
  const [newSeparator, setNewSeparator] = useState("");
  const [saved, setSaved] = useState(false);

  const query = useQuery({ queryKey: ["library-settings"], queryFn: getLibrarySettings });

  useEffect(() => {
    if (query.data && separators === null) {
      setSeparators(query.data.metadata_separators);
    }
  }, [query.data, separators]);

  const saveMutation = useMutation({
    mutationFn: (value: string[]) => updateLibrarySettings({ metadata_separators: value }),
    onSuccess: (data) => {
      queryClient.setQueryData(["library-settings"], data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const rescanMutation = useMutation({
    mutationFn: () => startScan(true),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["scan-status"] }),
  });

  const loudness = useQuery({
    queryKey: ["loudness-status"],
    queryFn: getLoudnessStatus,
    refetchInterval: (query) => (query.state.data?.running ? 2000 : false),
  });

  const loudnessMutation = useMutation({
    mutationFn: startLoudnessAnalysis,
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["loudness-status"] }),
  });

  if (query.isPending || separators === null) return <PageSpinner />;
  if (query.isError) {
    return <p className="text-red-400">Failed to load library settings.</p>;
  }

  const addSeparator = (event: FormEvent) => {
    event.preventDefault();
    const value = newSeparator;
    if (!value || separators.includes(value)) return;
    setSeparators([...separators, value]);
    setNewSeparator("");
  };

  const removeSeparator = (value: string) => {
    setSeparators(separators.filter((separator) => separator !== value));
  };

  return (
    <div className="max-w-3xl">
      <div className="rounded-lg border border-zinc-800 p-4">
        <p className="text-sm font-medium text-zinc-300">Metadata separators</p>
        <p className="mt-1 text-xs text-zinc-500">
          Multi-value tags are split on these characters. For example, with the
          &quot;/&quot; separator an artist tag of &quot;ACDC/Kiss&quot; becomes two distinct
          artists, and the track appears on both artist pages. Changes apply on the next
          library scan.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {separators.length === 0 && (
            <p className="text-xs text-zinc-500">No separators — tags are never split.</p>
          )}
          {separators.map((separator) => (
            <span
              key={separator}
              className="flex items-center gap-1 rounded-full bg-zinc-800 px-3 py-1 font-mono text-sm text-zinc-100"
            >
              &quot;{separator}&quot;
              <button
                type="button"
                onClick={() => removeSeparator(separator)}
                className="rounded-full p-0.5 text-zinc-500 transition-colors hover:text-red-400"
                aria-label={`Remove separator ${separator}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>

        <form onSubmit={addSeparator} className="mt-4 flex gap-2">
          <input
            className={`${inputClass} w-40 font-mono`}
            placeholder="e.g. / or feat."
            value={newSeparator}
            onChange={(event) => setNewSeparator(event.target.value)}
            maxLength={10}
          />
          <button type="submit" className={`${buttonClass} w-auto px-4`}>
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add
            </span>
          </button>
        </form>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => saveMutation.mutate(separators)}
            disabled={saveMutation.isPending}
            className={`${buttonClass} w-auto px-6`}
          >
            {saveMutation.isPending ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => rescanMutation.mutate()}
            disabled={rescanMutation.isPending}
            className="flex items-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Run full rescan
          </button>
          {saved && <span className="text-sm text-emerald-500">Saved.</span>}
          {rescanMutation.isSuccess && (
            <span className="text-sm text-emerald-500">Full rescan started.</span>
          )}
          {(saveMutation.isError || rescanMutation.isError) && (
            <span className="text-sm text-red-400">Something went wrong.</span>
          )}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          A normal scan skips unchanged files, so after changing separators run a full
          rescan to re-split the existing library.
        </p>
      </div>

      <div className="mt-6 rounded-lg border border-zinc-800 p-4">
        <p className="text-sm font-medium text-zinc-300">Volume normalization</p>
        <p className="mt-1 text-xs text-zinc-500">
          The scanner reads ReplayGain tags when present. For untagged files this
          analysis measures loudness with ffmpeg (EBU R128, -18 LUFS reference) and
          stores the gain, so the player&apos;s &quot;Normalize volume&quot; option can
          even out quiet and loud tracks.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => loudnessMutation.mutate()}
            disabled={loudnessMutation.isPending || loudness.data?.running === true}
            className={`${buttonClass} w-auto px-6`}
          >
            {loudness.data?.running ? "Analyzing..." : "Analyze missing tracks"}
          </button>
          {loudness.data?.running && (
            <span className="text-sm text-zinc-400">
              {loudness.data.done}/{loudness.data.total}
              {loudness.data.failed > 0 && ` (${loudness.data.failed} failed)`}
            </span>
          )}
          {loudness.data && !loudness.data.running && loudness.data.total > 0 && (
            <span className="text-sm text-emerald-500">
              Done: {loudness.data.done - loudness.data.failed}/{loudness.data.total} measured.
            </span>
          )}
          {loudness.data?.error && (
            <span className="text-sm text-red-400">{loudness.data.error}</span>
          )}
        </div>
        {loudness.data && !loudness.data.ffmpeg_available && (
          <p className="mt-2 text-xs text-amber-400">
            ffmpeg was not found on the server — only ReplayGain tags will be used.
          </p>
        )}
      </div>
    </div>
  );
}
