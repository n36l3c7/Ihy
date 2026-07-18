import { useMutation } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";

import { type BackupImportSummary, exportBackup, importBackup } from "../../api/admin";
import { ApiError } from "../../api/http";
import { buttonClass } from "../auth/LoginPage";

const SECTIONS = [
  { key: "settings", label: "Settings", hint: "separators, spotdl options, schedules" },
  { key: "sources", label: "Sources", hint: "library folders" },
  { key: "users", label: "Users", hint: "accounts, roles and password hashes" },
  { key: "watches", label: "SpotDL watches", hint: "watched artists and saved fixes" },
  { key: "playlists", label: "Playlists & favorites", hint: "matched by file path on restore" },
];

function SectionChecklist({
  available,
  selected,
  onToggle,
}: {
  available: string[] | null;
  selected: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {SECTIONS.filter((section) => available === null || available.includes(section.key)).map(
        (section) => (
          <label key={section.key} className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={selected.has(section.key)}
              onChange={() => onToggle(section.key)}
              className="accent-emerald-500"
            />
            {section.label}
            <span className="text-xs text-zinc-500">— {section.hint}</span>
          </label>
        ),
      )}
    </div>
  );
}

export function BackupPage() {
  const [exportSelected, setExportSelected] = useState<Set<string>>(
    new Set(SECTIONS.map((section) => section.key)),
  );
  const [restoreData, setRestoreData] = useState<Record<string, unknown> | null>(null);
  const [restoreAvailable, setRestoreAvailable] = useState<string[]>([]);
  const [restoreSelected, setRestoreSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggle = (set: Set<string>, setter: (next: Set<string>) => void) => (key: string) => {
    const next = new Set(set);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setter(next);
  };

  const exportMutation = useMutation({
    mutationFn: () => exportBackup([...exportSelected]),
    onSuccess: (data) => {
      setError(null);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ihy-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Export failed"),
  });

  const importMutation = useMutation<BackupImportSummary, unknown>({
    mutationFn: () => importBackup([...restoreSelected], restoreData),
    onSuccess: () => setError(null),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Restore failed"),
  });

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      if (parsed.app !== "ihy" || typeof parsed.sections !== "object") {
        setError("Not a valid Ihy backup file");
        return;
      }
      const available = Object.keys(parsed.sections as object);
      setRestoreData(parsed);
      setRestoreAvailable(available);
      setRestoreSelected(new Set(available));
      importMutation.reset();
      setError(null);
    } catch {
      setError("Could not parse the file as JSON");
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6 rounded-lg border border-zinc-800 p-5">
        <p className="mb-1 text-sm font-medium text-zinc-300">Export configuration</p>
        <p className="mb-4 text-xs text-zinc-500">
          Downloads a JSON file with the selected sections. The music files themselves are
          not included.
        </p>
        <SectionChecklist
          available={null}
          selected={exportSelected}
          onToggle={toggle(exportSelected, setExportSelected)}
        />
        <button
          type="button"
          onClick={() => exportMutation.mutate()}
          disabled={exportMutation.isPending || exportSelected.size === 0}
          className={`${buttonClass} mt-4 w-auto px-5`}
        >
          <span className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            {exportMutation.isPending ? "Exporting..." : "Export backup"}
          </span>
        </button>
      </div>

      <div className="rounded-lg border border-zinc-800 p-5">
        <p className="mb-1 text-sm font-medium text-zinc-300">Restore configuration</p>
        <p className="mb-4 text-xs text-zinc-500">
          Merges a backup into this instance: entities are matched by path/username/name,
          nothing is deleted. Existing users keep their password.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          onChange={(event) => void handleFile(event)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
        >
          <span className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Choose backup file
          </span>
        </button>

        {restoreData !== null && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-zinc-400">Sections found in the file:</p>
            <SectionChecklist
              available={restoreAvailable}
              selected={restoreSelected}
              onToggle={toggle(restoreSelected, setRestoreSelected)}
            />
            <button
              type="button"
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending || restoreSelected.size === 0}
              className={`${buttonClass} mt-4 w-auto px-5`}
            >
              {importMutation.isPending ? "Restoring..." : "Restore selected sections"}
            </button>
          </div>
        )}

        {importMutation.isSuccess && (
          <div className="mt-4 rounded-md bg-zinc-950 p-3 text-xs">
            <p className="mb-2 font-medium text-emerald-500">Restore completed:</p>
            {Object.entries(importMutation.data.sections).map(([section, counts]) => (
              <p key={section} className="text-zinc-400">
                {section}: {counts.created} created, {counts.updated} updated, {counts.skipped}{" "}
                skipped
              </p>
            ))}
          </div>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </div>
  );
}
