import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";

import { getRatings, setRating } from "../api/ratings";

/** Five clickable stars bound to the user's rating of a track.
 *  Clicking the current value clears the rating. */
export function RatingStars({
  trackId,
  size = "h-4 w-4",
  className,
}: {
  trackId: number;
  size?: string;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const ratings = useQuery({
    queryKey: ["ratings"],
    queryFn: getRatings,
    staleTime: 60_000,
  });
  const current = ratings.data?.find((entry) => entry.track_id === trackId)?.rating ?? 0;

  const mutation = useMutation({
    mutationFn: (value: number) => setRating(trackId, value),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["ratings"] }),
  });

  return (
    <span className={`inline-flex items-center gap-0.5 ${className ?? ""}`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <button
          key={value}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            mutation.mutate(value === current ? 0 : value);
          }}
          className="rounded p-0.5 transition-transform hover:scale-110"
          aria-label={`Rate ${value} of 5`}
        >
          <Star
            className={`${size} ${
              value <= current ? "fill-emerald-500 text-emerald-500" : "text-zinc-600"
            }`}
          />
        </button>
      ))}
    </span>
  );
}
