import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { type TrackTagsUpdate, updateTrackTags } from "../../api/tags";
import type { Track } from "../../api/types";
import { CoverImage } from "../../components/CoverImage";
import { Modal } from "../../components/Modal";
import { buttonClass, inputClass } from "../auth/LoginPage";
import { joinListField, splitListField } from "./tagFormUtils";

interface AlbumTracksEditorProps {
  albumId: number;
  albumTitle: string;
  tracks: Track[];
  onClose: () => void;
}

interface Row {
  trackId: number;
  track_number: string;
  title: string;
  artists: string;
  genres: string;
  year: string;
  status: "idle" | "saving" | "saved" | "error";
}

const cellClass = `${inputClass} px-2 py-1 text-xs`;

function buildRows(tracks: Track[]): Row[] {
  return tracks.map((track) => ({
    trackId: track.id,
    track_number: track.track_number?.toString() ?? "",
    title: track.title,
    artists: joinListField(track.artists),
    genres: joinListField(track.genres),
    year: track.year?.toString() ?? "",
    status: "idle",
  }));
}

/** Mp3tag-style grid: every track of the album editable on one screen. */
export function AlbumTracksEditor({ albumId, albumTitle, tracks, onClose }: AlbumTracksEditorProps) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Row[]>(() => buildRows(tracks));
  const [initialRows] = useState<Row[]>(() => buildRows(tracks));
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const setCell = (index: number, field: keyof Row) => (event: { target: { value: string } }) =>
    setRows((current) =>
      current.map((row, i) =>
        i === index ? { ...row, [field]: event.target.value, status: "idle" } : row,
      ),
    );

  const rowChanges = (row: Row, before: Row): TrackTagsUpdate => {
    const changes: TrackTagsUpdate = {};
    if (row.title !== before.title && row.title.trim()) changes.title = row.title.trim();
    if (row.artists !== before.artists) {
      const values = splitListField(row.artists);
      changes.artists = values.length > 0 ? values : null;
    }
    if (row.genres !== before.genres) {
      const values = splitListField(row.genres);
      changes.genres = values.length > 0 ? values : null;
    }
    if (row.track_number !== before.track_number) {
      const parsed = Number(row.track_number);
      changes.track_number =
        row.track_number.trim() === "" ? null : Number.isInteger(parsed) ? parsed : undefined;
      if (changes.track_number === undefined) delete changes.track_number;
    }
    if (row.year !== before.year) {
      const parsed = Number(row.year);
      changes.year = row.year.trim() === "" ? null : Number.isInteger(parsed) ? parsed : undefined;
      if (changes.year === undefined) delete changes.year;
    }
    return changes;
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSummary(null);
    let savedCount = 0;
    let errorCount = 0;
    for (let i = 0; i < rows.length; i++) {
      const changes = rowChanges(rows[i], initialRows[i]);
      if (Object.keys(changes).length === 0) continue;
      setRows((current) =>
        current.map((row, index) => (index === i ? { ...row, status: "saving" } : row)),
      );
      try {
        await updateTrackTags(rows[i].trackId, changes);
        savedCount += 1;
        setRows((current) =>
          current.map((row, index) => (index === i ? { ...row, status: "saved" } : row)),
        );
      } catch {
        errorCount += 1;
        setRows((current) =>
          current.map((row, index) => (index === i ? { ...row, status: "error" } : row)),
        );
      }
    }
    setSaving(false);
    void queryClient.invalidateQueries();
    if (errorCount === 0 && savedCount > 0) {
      onClose();
    } else if (savedCount === 0 && errorCount === 0) {
      setSummary("Nothing changed.");
    } else {
      setSummary(`Saved ${savedCount} tracks, ${errorCount} errors.`);
    }
  };

  return (
    <Modal title={`Edit tracks — ${albumTitle}`} onClose={onClose} wide>
      <form onSubmit={(event) => void handleSave(event)}>
        <div className="mb-4 flex items-center gap-4">
          <CoverImage albumId={albumId} className="h-16 w-16 rounded-md shadow" />
          <p className="text-xs text-zinc-500">
            Every row is saved independently — only changed cells are written to the files.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-zinc-500">
                <th className="w-14 px-1 pb-2">#</th>
                <th className="px-1 pb-2">Title</th>
                <th className="px-1 pb-2">Artists</th>
                <th className="px-1 pb-2">Genres</th>
                <th className="w-20 px-1 pb-2">Year</th>
                <th className="w-14 px-1 pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.trackId} className="border-t border-zinc-800/60">
                  <td className="px-1 py-1">
                    <input
                      className={cellClass}
                      value={row.track_number}
                      onChange={setCell(index, "track_number")}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      className={cellClass}
                      value={row.title}
                      onChange={setCell(index, "title")}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      className={cellClass}
                      value={row.artists}
                      onChange={setCell(index, "artists")}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      className={cellClass}
                      value={row.genres}
                      onChange={setCell(index, "genres")}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      className={cellClass}
                      value={row.year}
                      onChange={setCell(index, "year")}
                    />
                  </td>
                  <td className="px-1 py-1 text-center text-xs">
                    {row.status === "saving" && <span className="text-zinc-400">…</span>}
                    {row.status === "saved" && <span className="text-emerald-500">✓</span>}
                    {row.status === "error" && <span className="text-red-400">✗</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {summary && <p className="mt-3 text-sm text-amber-400">{summary}</p>}
        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 transition-colors hover:border-zinc-500"
          >
            Close
          </button>
          <button type="submit" disabled={saving} className={`${buttonClass} w-auto px-6`}>
            {saving ? "Saving..." : "Save all changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
