import { create } from "zustand";
import { persist } from "zustand/middleware";

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const EQ_PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "Bass Boost": [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  Rock: [4, 3, 1, -1, -2, -1, 1, 3, 4, 4],
  Pop: [-1, 0, 2, 4, 4, 2, 0, -1, -1, -2],
  Jazz: [3, 2, 0, 1, 2, 2, 0, 1, 2, 3],
  Classical: [3, 2, 0, 0, 0, 0, -2, -2, 0, 2],
  Vocal: [-2, -3, -2, 1, 4, 4, 3, 1, 0, -1],
};

interface EqState {
  enabled: boolean;
  gains: number[]; // dB, one per frequency band
  setEnabled: (enabled: boolean) => void;
  setGain: (band: number, value: number) => void;
  applyPreset: (name: string) => void;
}

export const useEqStore = create<EqState>()(
  persist(
    (set) => ({
      enabled: false,
      gains: EQ_PRESETS.Flat.slice(),
      setEnabled: (enabled) => set({ enabled }),
      setGain: (band, value) =>
        set((state) => ({
          gains: state.gains.map((gain, index) => (index === band ? value : gain)),
        })),
      applyPreset: (name) => {
        const preset = EQ_PRESETS[name];
        if (preset) set({ gains: preset.slice(), enabled: true });
      },
    }),
    { name: "ihy-equalizer" },
  ),
);
