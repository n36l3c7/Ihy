import { Plus, X } from "lucide-react";
import { useState } from "react";

import type { SmartPlaylist, SmartPlaylistPayload, SmartRule } from "../../api/smartPlaylists";

interface FieldDef {
  id: string;
  label: string;
  ops: { id: string; label: string }[];
  type: "text" | "number" | "bool";
}

const FIELDS: FieldDef[] = [
  {
    id: "title",
    label: "Title",
    type: "text",
    ops: [
      { id: "contains", label: "contains" },
      { id: "is", label: "is" },
      { id: "is_not", label: "is not" },
    ],
  },
  {
    id: "artist",
    label: "Artist",
    type: "text",
    ops: [
      { id: "contains", label: "contains" },
      { id: "is", label: "is" },
      { id: "is_not", label: "is not" },
    ],
  },
  {
    id: "album",
    label: "Album",
    type: "text",
    ops: [
      { id: "contains", label: "contains" },
      { id: "is", label: "is" },
      { id: "is_not", label: "is not" },
    ],
  },
  {
    id: "genre",
    label: "Genre",
    type: "text",
    ops: [
      { id: "contains", label: "contains" },
      { id: "is", label: "is" },
      { id: "is_not", label: "is not" },
    ],
  },
  { id: "format", label: "Format", type: "text", ops: [{ id: "is", label: "is" }] },
  {
    id: "year",
    label: "Year",
    type: "number",
    ops: [
      { id: "eq", label: "is" },
      { id: "gte", label: "≥" },
      { id: "lte", label: "≤" },
    ],
  },
  {
    id: "duration",
    label: "Duration (seconds)",
    type: "number",
    ops: [
      { id: "gte", label: "≥" },
      { id: "lte", label: "≤" },
    ],
  },
  {
    id: "play_count",
    label: "Play count",
    type: "number",
    ops: [
      { id: "gte", label: "≥" },
      { id: "lte", label: "≤" },
      { id: "eq", label: "is" },
    ],
  },
  {
    id: "rating",
    label: "Rating (1-5)",
    type: "number",
    ops: [
      { id: "gte", label: "≥" },
      { id: "lte", label: "≤" },
      { id: "eq", label: "is" },
    ],
  },
  {
    id: "added_days",
    label: "Added in the last (days)",
    type: "number",
    ops: [{ id: "lte", label: "window" }],
  },
  {
    id: "played_days",
    label: "Played in the last (days)",
    type: "number",
    ops: [{ id: "lte", label: "window" }],
  },
  {
    id: "not_played_days",
    label: "Not played in the last (days)",
    type: "number",
    ops: [{ id: "lte", label: "window" }],
  },
  { id: "liked", label: "Liked", type: "bool", ops: [{ id: "is", label: "is" }] },
];

const SORTS = [
  { id: "title", label: "Title" },
  { id: "recent", label: "Recently added" },
  { id: "random", label: "Random" },
  { id: "most_played", label: "Most played" },
  { id: "year", label: "Year (newest)" },
];

const fieldDef = (id: string): FieldDef => FIELDS.find((field) => field.id === id) ?? FIELDS[0];

const selectClass =
  "rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-600";
const inputClass = `${selectClass} min-w-0 flex-1`;

export function SmartPlaylistDialog({
  initial,
  onSave,
  onClose,
}: {
  initial?: SmartPlaylist;
  onSave: (payload: SmartPlaylistPayload) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [match, setMatch] = useState<"all" | "any">(initial?.match ?? "all");
  const [sort, setSort] = useState(initial?.sort ?? "title");
  const [maxTracks, setMaxTracks] = useState(initial?.max_tracks ?? 100);
  const [rules, setRules] = useState<SmartRule[]>(initial?.rules ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const updateRule = (index: number, patch: Partial<SmartRule>) => {
    setRules((current) =>
      current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
    );
  };

  const setRuleField = (index: number, field: string) => {
    const def = fieldDef(field);
    updateRule(index, {
      field,
      op: def.ops[0].id,
      value: def.type === "bool" ? true : def.type === "number" ? 0 : "",
    });
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Give the playlist a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        match,
        sort,
        max_tracks: maxTracks,
        rules: rules.map((rule) => ({
          ...rule,
          value:
            fieldDef(rule.field).type === "number" ? Number(rule.value) || 0 : rule.value,
        })),
      });
      onClose();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-zinc-100">
          {initial ? "Edit smart playlist" : "New smart playlist"}
        </h2>

        <label className="mt-4 block text-xs font-medium text-zinc-400">
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={`${inputClass} mt-1 w-full`}
            maxLength={100}
          />
        </label>

        <div className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
          Match
          <select
            value={match}
            onChange={(event) => setMatch(event.target.value as "all" | "any")}
            className={selectClass}
          >
            <option value="all">all rules</option>
            <option value="any">any rule</option>
          </select>
        </div>

        <div className="mt-3 space-y-2">
          {rules.map((rule, index) => {
            const def = fieldDef(rule.field);
            return (
              <div key={index} className="flex items-center gap-2">
                <select
                  value={rule.field}
                  onChange={(event) => setRuleField(index, event.target.value)}
                  className={selectClass}
                >
                  {FIELDS.map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.label}
                    </option>
                  ))}
                </select>
                {def.ops.length > 1 && (
                  <select
                    value={rule.op}
                    onChange={(event) => updateRule(index, { op: event.target.value })}
                    className={selectClass}
                  >
                    {def.ops.map((op) => (
                      <option key={op.id} value={op.id}>
                        {op.label}
                      </option>
                    ))}
                  </select>
                )}
                {def.type === "bool" ? (
                  <select
                    value={String(rule.value)}
                    onChange={(event) =>
                      updateRule(index, { value: event.target.value === "true" })
                    }
                    className={selectClass}
                  >
                    <option value="true">yes</option>
                    <option value="false">no</option>
                  </select>
                ) : (
                  <input
                    type={def.type === "number" ? "number" : "text"}
                    value={String(rule.value)}
                    onChange={(event) => updateRule(index, { value: event.target.value })}
                    className={inputClass}
                  />
                )}
                <button
                  type="button"
                  onClick={() => setRules((current) => current.filter((_, i) => i !== index))}
                  className="rounded-full p-1.5 text-zinc-500 transition-colors hover:text-red-400"
                  aria-label="Remove rule"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() =>
            setRules((current) => [...current, { field: "genre", op: "contains", value: "" }])
          }
          className="mt-2 flex items-center gap-1.5 rounded-full px-3 py-1 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          <Plus className="h-4 w-4" />
          Add rule
        </button>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-zinc-300">
          <label className="flex items-center gap-2">
            Sort by
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className={selectClass}
            >
              {SORTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Limit
            <input
              type="number"
              min={1}
              max={1000}
              value={maxTracks}
              onChange={(event) => setMaxTracks(Number(event.target.value) || 100)}
              className={`${selectClass} w-24`}
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-zinc-400 transition-colors hover:text-zinc-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
