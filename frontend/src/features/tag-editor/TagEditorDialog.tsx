import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { type TrackTagsUpdate, updateTrackTags } from "../../api/tags";
import type { Track } from "../../api/types";
import { Modal } from "../../components/Modal";
import { buttonClass, inputClass } from "../auth/LoginPage";
import {
  joinListField,
  parseListField,
  parseNumberField,
  parseTextField,
} from "./tagFormUtils";

interface TagEditorDialogProps {
  track: Track;
  onClose: () => void;
}

const labelClass = "mb-1 block text-xs font-medium text-zinc-400";

export function TagEditorDialog({ track, onClose }: TagEditorDialogProps) {
  const queryClient = useQueryClient();

  const initial = {
    title: track.title,
    artists: joinListField(track.artists),
    album: track.album?.title ?? "",
    genres: joinListField(track.genres),
    year: track.year?.toString() ?? "",
    track_number: track.track_number?.toString() ?? "",
    disc_number: track.disc_number?.toString() ?? "",
  };
  const [form, setForm] = useState(initial);

  const mutation = useMutation({
    mutationFn: (changes: TrackTagsUpdate) => updateTrackTags(track.id, changes),
    onSuccess: () => {
      void queryClient.invalidateQueries();
      onClose();
    },
  });

  const set = (field: keyof typeof initial) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const changes: TrackTagsUpdate = {};
    const title = parseTextField(form.title, initial.title);
    if (title !== undefined) changes.title = title;
    const artists = parseListField(form.artists, initial.artists);
    if (artists !== undefined) changes.artists = artists;
    const album = parseTextField(form.album, initial.album);
    if (album !== undefined) changes.album = album;
    const genres = parseListField(form.genres, initial.genres);
    if (genres !== undefined) changes.genres = genres;
    const year = parseNumberField(form.year, initial.year);
    if (year !== undefined) changes.year = year;
    const trackNumber = parseNumberField(form.track_number, initial.track_number);
    if (trackNumber !== undefined) changes.track_number = trackNumber;
    const discNumber = parseNumberField(form.disc_number, initial.disc_number);
    if (discNumber !== undefined) changes.disc_number = discNumber;

    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    mutation.mutate(changes);
  };

  return (
    <Modal title="Edit tags" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className={labelClass}>Title</label>
          <input className={inputClass} value={form.title} onChange={set("title")} />
        </div>
        <div>
          <label className={labelClass}>Artists (separate multiple with ;)</label>
          <input className={inputClass} value={form.artists} onChange={set("artists")} />
        </div>
        <div>
          <label className={labelClass}>Album</label>
          <input className={inputClass} value={form.album} onChange={set("album")} />
        </div>
        <div>
          <label className={labelClass}>Genres (separate multiple with ;)</label>
          <input className={inputClass} value={form.genres} onChange={set("genres")} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Year</label>
            <input
              className={inputClass}
              value={form.year}
              onChange={set("year")}
              inputMode="numeric"
            />
          </div>
          <div>
            <label className={labelClass}>Track #</label>
            <input
              className={inputClass}
              value={form.track_number}
              onChange={set("track_number")}
              inputMode="numeric"
            />
          </div>
          <div>
            <label className={labelClass}>Disc #</label>
            <input
              className={inputClass}
              value={form.disc_number}
              onChange={set("disc_number")}
              inputMode="numeric"
            />
          </div>
        </div>
        {mutation.isError && (
          <p className="text-sm text-red-400">
            {mutation.error instanceof Error ? mutation.error.message : "Failed to save tags"}
          </p>
        )}
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
            {mutation.isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
