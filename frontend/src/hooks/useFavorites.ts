import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { addFavorite, getFavoriteIds, removeFavorite } from "../api/userLibrary";

export function useFavorites() {
  const queryClient = useQueryClient();

  const idsQuery = useQuery({
    queryKey: ["favorite-ids"],
    queryFn: getFavoriteIds,
    staleTime: 60_000,
  });
  const ids = useMemo(() => new Set(idsQuery.data ?? []), [idsQuery.data]);

  const toggleMutation = useMutation({
    mutationFn: ({ trackId, favorite }: { trackId: number; favorite: boolean }) =>
      favorite ? removeFavorite(trackId) : addFavorite(trackId),
    onMutate: async ({ trackId, favorite }) => {
      await queryClient.cancelQueries({ queryKey: ["favorite-ids"] });
      const previous = queryClient.getQueryData<number[]>(["favorite-ids"]);
      queryClient.setQueryData<number[]>(["favorite-ids"], (old = []) =>
        favorite ? old.filter((id) => id !== trackId) : [...old, trackId],
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(["favorite-ids"], context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["favorite-ids"] });
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

  return {
    isFavorite: (trackId: number) => ids.has(trackId),
    toggle: (trackId: number) =>
      toggleMutation.mutate({ trackId, favorite: ids.has(trackId) }),
  };
}
