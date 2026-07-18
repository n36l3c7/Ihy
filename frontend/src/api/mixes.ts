import { api } from "./http";
import type { Track } from "./types";

export interface DailyMix {
  name: string;
  genre: string;
  tracks: Track[];
}

export const getDailyMixes = () => api<DailyMix[]>("/mixes/daily");
