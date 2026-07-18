import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { type BatchTagChanges, batchUpdateTags } from "../../api/tags";
import { Modal } from "../../components/Modal";
import { buttonClass, inputClass } from "../auth/LoginPage";
import { parseListField, parseNumberField, parseTextField } from "./tagFormUtils";

interface BatchTagsDialogProps {
  trackIds: number[];
  heading: string;
  /** Prefilled values (e.g. from an album). Empty fields are left untouched. */
  initial?: Partial<{ artists: string; album: string; album_artist: string; year: string }>;
  onClose: () => void;
}

const labelClass = "mb-1 block text-xs font-medium text-zinc-400";

export function BatchTagsDialog({ trackIds, heading, initial, onClose }: BatchTagsDialogProps) {
  const queryClient = useQueryClient();

  const initialForm = {
    artists: initial?.artists ?? "",
    album: initial?.album ?? "",
    album_artist: initial?.album_artist ?? "",
    genres: "",
    year: initial?.year ?? "",
  };
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (changes: BatchTagChanges) => batchUpdateTags(trackIds, changes),
    onSuccess: (data) => {
      void queryClient.invalidateQueries();
      if (data.errors.length > 0) {
        setResult(`Updated ${data.updated} tracks, ${data.errors.length} errors`);
      } else {
        onClose();
      }
    },
  });

  const set = (field: keyof typeof initialForm) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const changes: BatchTagChanges = {};
    const artists = parseListField(form.artists, initialForm.artists);
    if (artists !== undefined) changes.artists = artists;
    const album = parseTextField(form.album, initialForm.album);
    if (album !== undefined) changes.album = album;
    const albumArtist = parseTextField(form.album_artist, initialForm.album_artist);
    if (albumArtist !== undefined) changes.album_artist = albumArtist;
    const genres = parseListField(form.genres, initialForm.genres);
    if (genres !== undefined) changes.genres = genres;
    const year = parseNumberField(form.year, initialForm.year);
    if (year !== undefined) changes.year = year;

    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    mutation.mutate(changes);
  };

  return (
    <Modal title={heading} onClose={onClose}>
      <p className="mb-4 text-xs text-zinc-500">
        Only the fields you change are written to the files; the rest stay untouched.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className={labelClass}>Artists (separate multiple with ;)</label>
          <input className={inputClass} value={form.artists} onChange={set("artists")} />
        </div>
        <div>
          <label className={labelClass}>Album</label>
          <input className={inputClass} value={form.album} onChange={set("album")} />
        </div>
        <div>
          <label className={labelClass}>Album artist</label>
          <input className={inputClass} value={form.album_artist} onChange={set("album_artist")} />
        </div>
        <div>
          <label className={labelClass}>Genres (separate multiple with ;)</label>
          <input className={inputClass} value={form.genres} onChange={set("genres")} />
        </div>
        <div className="w-32">
          <label className={labelClass}>Year</label>
          <input
            className={inputClass}
            value={form.year}
            onChange={set("year")}
            inputMode="numeric"
          />
        </div>
        {result && <p className="text-sm text-amber-400">{result}</p>}
        {mutation.isError && <p className="text-sm text-red-400">Failed to save tags.</p>}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 transition-colors hover:border-zinc-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className={`${buttonClass} w-auto px-6`}
          >
            {mutation.isPending ? "Saving..." : `Apply to ${trackIds.length} tracks`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
