import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { getLibrarySettings, updateLibrarySettings } from "../../api/admin";
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
          {saved && <span className="text-sm text-emerald-500">Saved.</span>}
          {saveMutation.isError && (
            <span className="text-sm text-red-400">Failed to save settings.</span>
          )}
        </div>
      </div>
    </div>
  );
}
