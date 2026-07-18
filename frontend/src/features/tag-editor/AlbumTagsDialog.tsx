import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { type BatchTagChanges, batchUpdateTags } from "../../api/tags";
import type { AlbumDetail } from "../../api/types";
import { Modal } from "../../components/Modal";
import { buttonClass, inputClass } from "../auth/LoginPage";
import { parseListField, parseNumberField, parseTextField } from "./tagFormUtils";

interface AlbumTagsDialogProps {
  album: AlbumDetail;
  onClose: () => void;
}

const labelClass = "mb-1 block text-xs font-medium text-zinc-400";

export function AlbumTagsDialog({ album, onClose }: AlbumTagsDialogProps) {
  const queryClient = useQueryClient();

  const initial = {
    album: album.title,
    album_artist: album.artist?.name ?? "",
    genres: "",
    year: album.year?.toString() ?? "",
  };
  const [form, setForm] = useState(initial);
  const [result, setResult] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (changes: BatchTagChanges) =>
      batchUpdateTags(
        album.tracks.map((track) => track.id),
        changes,
      ),
    onSuccess: (data) => {
      void queryClient.invalidateQueries();
      if (data.errors.length > 0) {
        setResult(`Updated ${data.updated} tracks, ${data.errors.length} errors`);
      } else {
        onClose();
      }
    },
  });

  const set = (field: keyof typeof initial) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const changes: BatchTagChanges = {};
    const albumTitle = parseTextField(form.album, initial.album);
    if (albumTitle !== undefined) changes.album = albumTitle;
    const albumArtist = parseTextField(form.album_artist, initial.album_artist);
    if (albumArtist !== undefined) changes.album_artist = albumArtist;
    const genres = parseListField(form.genres, initial.genres);
    if (genres !== undefined) changes.genres = genres;
    const year = parseNumberField(form.year, initial.year);
    if (year !== undefined) changes.year = year;

    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    mutation.mutate(changes);
  };

  return (
    <Modal title={`Edit tags for all ${album.tracks.length} tracks`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className={labelClass}>Album title</label>
          <input className={inputClass} value={form.album} onChange={set("album")} />
        </div>
        <div>
          <label className={labelClass}>Album artist</label>
          <input className={inputClass} value={form.album_artist} onChange={set("album_artist")} />
        </div>
        <div>
          <label className={labelClass}>
            Genres (separate multiple with ; — leave empty to keep current)
          </label>
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
            {mutation.isPending ? "Saving..." : "Apply to all tracks"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
