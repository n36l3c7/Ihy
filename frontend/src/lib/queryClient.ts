import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
      // Keeps multiple open tabs in sync: switching back to a tab
      // refreshes its stale data
      refetchOnWindowFocus: true,
    },
  },
});
