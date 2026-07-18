import { Modal } from "../../components/Modal";
import { EQ_FREQUENCIES, EQ_PRESETS, useEqStore } from "../../stores/eqStore";

function formatFrequency(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

export function EqualizerDialog({ onClose }: { onClose: () => void }) {
  const enabled = useEqStore((state) => state.enabled);
  const gains = useEqStore((state) => state.gains);
  const setEnabled = useEqStore((state) => state.setEnabled);
  const setGain = useEqStore((state) => state.setGain);
  const applyPreset = useEqStore((state) => state.applyPreset);

  return (
    <Modal title="Equalizer" onClose={onClose}>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="accent-emerald-500"
          />
          Enabled
        </label>
        <select
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none"
          value=""
          onChange={(event) => {
            if (event.target.value) applyPreset(event.target.value);
          }}
        >
          <option value="">Apply preset...</option>
          {Object.keys(EQ_PRESETS).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => applyPreset("Flat")}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:border-zinc-500"
        >
          Reset
        </button>
      </div>

      <div className={`flex flex-col gap-2 ${enabled ? "" : "opacity-40"}`}>
        {EQ_FREQUENCIES.map((frequency, index) => (
          <div key={frequency} className="flex items-center gap-3">
            <span className="w-10 shrink-0 text-right font-mono text-xs text-zinc-400">
              {formatFrequency(frequency)}
            </span>
            <input
              type="range"
              min={-12}
              max={12}
              step={0.5}
              value={gains[index] ?? 0}
              onChange={(event) => setGain(index, Number(event.target.value))}
              disabled={!enabled}
              className="h-1 flex-1 cursor-pointer"
              aria-label={`${formatFrequency(frequency)} Hz gain`}
            />
            <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-zinc-400">
              {(gains[index] ?? 0) > 0 ? "+" : ""}
              {(gains[index] ?? 0).toFixed(1)}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-zinc-500">
        Gains are in dB per band. Settings persist in this browser.
      </p>
    </Modal>
  );
}
