import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";

import { getFileTags, type TrackTagsUpdate, updateTrackTags } from "../../api/tags";
import type { Track } from "../../api/types";
import { CoverImage } from "../../components/CoverImage";
import { Modal } from "../../components/Modal";
import { PageSpinner } from "../../components/Spinner";
import { buttonClass, inputClass } from "../auth/LoginPage";
import { splitListField } from "./tagFormUtils";

interface TagEditorDialogProps {
  track: Track;
  onClose: () => void;
}

const labelClass = "mb-1 block text-xs font-medium text-zinc-400";

/** Text fields written 1:1 (form key = API key). */
const SIMPLE_FIELDS: { key: keyof TrackTagsUpdate & string; label: string }[] = [
  { key: "composer", label: "Composer" },
  { key: "lyricist", label: "Lyricist" },
  { key: "conductor", label: "Conductor" },
  { key: "publisher", label: "Publisher" },
  { key: "copyright", label: "Copyright" },
  { key: "isrc", label: "ISRC" },
  { key: "bpm", label: "BPM" },
  { key: "language", label: "Language" },
  { key: "website", label: "Website" },
];

type FormState = Record<string, string>;

export function TagEditorDialog({ track, onClose }: TagEditorDialogProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [initial, setInitial] = useState<FormState | null>(null);

  const fileTags = useQuery({
    queryKey: ["file-tags", track.id],
    queryFn: () => getFileTags(track.id),
    staleTime: 0,
    gcTime: 0,
  });

  useEffect(() => {
    if (fileTags.data && form === null) {
      const tags = fileTags.data;
      const state: FormState = {
        title: tags.title ?? "",
        artists: tags.artists.join("; "),
        album: tags.album ?? "",
        album_artist: tags.album_artist ?? "",
        genres: tags.genres.join("; "),
        date: tags.date ?? "",
        track_number: tags.track_number ?? "",
        disc_number: tags.disc_number ?? "",
        composer: tags.composer ?? "",
        comment: tags.comment ?? "",
        copyright: tags.copyright ?? "",
        isrc: tags.isrc ?? "",
        bpm: tags.bpm ?? "",
        conductor: tags.conductor ?? "",
        language: tags.language ?? "",
        publisher: tags.publisher ?? "",
        lyricist: tags.lyricist ?? "",
        website: tags.website ?? "",
      };
      setForm(state);
      setInitial(state);
    }
  }, [fileTags.data, form]);

  const mutation = useMutation({
    mutationFn: (changes: TrackTagsUpdate) => updateTrackTags(track.id, changes),
    onSuccess: () => {
      void queryClient.invalidateQueries();
      onClose();
    },
  });

  const set = (field: string) => (event: { target: { value: string } }) =>
    setForm((current) => current && { ...current, [field]: event.target.value });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!form || !initial) return;
    const changes: TrackTagsUpdate = {};

    const textDiff = (key: keyof TrackTagsUpdate & string) => {
      if (form[key] !== initial[key]) {
        changes[key] = (form[key].trim() || null) as never;
      }
    };
    textDiff("title");
    textDiff("album");
    textDiff("album_artist");
    textDiff("date");
    textDiff("comment");
    for (const { key } of SIMPLE_FIELDS) textDiff(key);

    if (form.artists !== initial.artists) {
      const values = splitListField(form.artists);
      changes.artists = values.length > 0 ? values : null;
    }
    if (form.genres !== initial.genres) {
      const values = splitListField(form.genres);
      changes.genres = values.length > 0 ? values : null;
    }
    const numberDiff = (key: "track_number" | "disc_number") => {
      if (form[key] !== initial[key]) {
        const parsed = Number(form[key].split("/")[0]);
        changes[key] = form[key].trim() === "" ? null : Number.isInteger(parsed) ? parsed : null;
      }
    };
    numberDiff("track_number");
    numberDiff("disc_number");

    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    mutation.mutate(changes);
  };

  return (
    <Modal title="Edit tags" onClose={onClose}>
      {fileTags.isPending || form === null ? (
        <PageSpinner />
      ) : fileTags.isError ? (
        <p className="py-8 text-center text-red-400">Failed to read tags from the file.</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <CoverImage
              albumId={track.album?.id}
              className="h-24 w-24 shrink-0 rounded-md shadow"
            />
            <div className="min-w-0 flex-1">
              <label className={labelClass}>Title</label>
              <input className={inputClass} value={form.title} onChange={set("title")} />
              <label className={`${labelClass} mt-3`}>Artists (separate multiple with ;)</label>
              <input className={inputClass} value={form.artists} onChange={set("artists")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Album</label>
              <input className={inputClass} value={form.album} onChange={set("album")} />
            </div>
            <div>
              <label className={labelClass}>Album artist</label>
              <input
                className={inputClass}
                value={form.album_artist}
                onChange={set("album_artist")}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Genres (separate multiple with ;)</label>
            <input className={inputClass} value={form.genres} onChange={set("genres")} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Date / year</label>
              <input className={inputClass} value={form.date} onChange={set("date")} />
            </div>
            <div>
              <label className={labelClass}>Track #</label>
              <input
                className={inputClass}
                value={form.track_number}
                onChange={set("track_number")}
              />
            </div>
            <div>
              <label className={labelClass}>Disc #</label>
              <input
                className={inputClass}
                value={form.disc_number}
                onChange={set("disc_number")}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {SIMPLE_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className={labelClass}>{label}</label>
                <input className={inputClass} value={form[key]} onChange={set(key)} />
              </div>
            ))}
          </div>
          <div>
            <label className={labelClass}>Comment</label>
            <textarea
              className={`${inputClass} min-h-16 resize-y`}
              value={form.comment}
              onChange={set("comment")}
            />
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
      )}
    </Modal>
  );
}
