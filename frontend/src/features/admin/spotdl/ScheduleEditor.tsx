import { useState } from "react";

import type { DownloadSettings } from "../../../api/downloads";
import { buttonClass, inputClass } from "../../auth/LoginPage";

type Mode = "disabled" | "hours" | "daily" | "weekly" | "cron";

const DAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

interface ParsedSchedule {
  mode: Mode;
  hours: string;
  time: string;
  dow: number;
  cronText: string;
}

function parseSettings(settings: DownloadSettings): ParsedSchedule {
  const base: ParsedSchedule = { mode: "disabled", hours: "24", time: "04:00", dow: 1, cronText: "" };
  const cron = settings.cron.trim();
  if (cron) {
    const parts = cron.split(/\s+/);
    if (
      parts.length === 5 &&
      /^\d+$/.test(parts[0]) &&
      /^\d+$/.test(parts[1]) &&
      parts[2] === "*" &&
      parts[3] === "*"
    ) {
      const time = `${parts[1].padStart(2, "0")}:${parts[0].padStart(2, "0")}`;
      if (parts[4] === "*") return { ...base, mode: "daily", time, cronText: cron };
      if (/^\d$/.test(parts[4])) {
        return { ...base, mode: "weekly", time, dow: Number(parts[4]), cronText: cron };
      }
    }
    return { ...base, mode: "cron", cronText: cron };
  }
  if (settings.check_interval_hours > 0) {
    return { ...base, mode: "hours", hours: settings.check_interval_hours.toString() };
  }
  return base;
}

function buildSettings(state: ParsedSchedule): DownloadSettings | null {
  const [hourText, minuteText] = state.time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  switch (state.mode) {
    case "disabled":
      return { check_interval_hours: 0, cron: "" };
    case "hours": {
      const hours = Number(state.hours);
      if (!Number.isInteger(hours) || hours < 1) return null;
      return { check_interval_hours: hours, cron: "" };
    }
    case "daily":
      if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
      return { check_interval_hours: 0, cron: `${minute} ${hour} * * *` };
    case "weekly":
      if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
      return { check_interval_hours: 0, cron: `${minute} ${hour} * * ${state.dow}` };
    case "cron":
      if (!state.cronText.trim()) return null;
      return { check_interval_hours: 0, cron: state.cronText.trim() };
  }
}

export function summarize(settings: DownloadSettings): string {
  const parsed = parseSettings(settings);
  switch (parsed.mode) {
    case "disabled":
      return "Automatic checks are disabled.";
    case "hours":
      return `Checks run every ${settings.check_interval_hours} hours.`;
    case "daily":
      return `Checks run every day at ${parsed.time}.`;
    case "weekly": {
      const day = DAYS.find((d) => d.value === parsed.dow)?.label ?? "?";
      return `Checks run every ${day} at ${parsed.time}.`;
    }
    case "cron":
      return `Checks follow the cron schedule "${settings.cron}".`;
  }
}

interface ScheduleEditorProps {
  settings: DownloadSettings;
  saving: boolean;
  onSave: (settings: DownloadSettings) => void;
}

export function ScheduleEditor({ settings, saving, onSave }: ScheduleEditorProps) {
  const [state, setState] = useState<ParsedSchedule>(() => parseSettings(settings));
  const [invalid, setInvalid] = useState(false);

  const set = <K extends keyof ParsedSchedule>(key: K, value: ParsedSchedule[K]) =>
    setState((current) => ({ ...current, [key]: value }));

  const handleSave = () => {
    const built = buildSettings(state);
    if (built === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onSave(built);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        className={`${inputClass} w-40 py-1`}
        value={state.mode}
        onChange={(event) => set("mode", event.target.value as Mode)}
      >
        <option value="disabled">Disabled</option>
        <option value="hours">Every N hours</option>
        <option value="daily">Every day at...</option>
        <option value="weekly">Every week on...</option>
        <option value="cron">Custom cron</option>
      </select>

      {state.mode === "hours" && (
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          every
          <input
            className={`${inputClass} w-16 py-1`}
            value={state.hours}
            onChange={(event) => set("hours", event.target.value)}
            inputMode="numeric"
          />
          hours
        </label>
      )}
      {(state.mode === "daily" || state.mode === "weekly") && (
        <>
          {state.mode === "weekly" && (
            <select
              className={`${inputClass} w-32 py-1`}
              value={state.dow}
              onChange={(event) => set("dow", Number(event.target.value))}
            >
              {DAYS.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            at
            <input
              type="time"
              className={`${inputClass} w-28 py-1`}
              value={state.time}
              onChange={(event) => set("time", event.target.value)}
            />
          </label>
        </>
      )}
      {state.mode === "cron" && (
        <input
          className={`${inputClass} w-44 py-1 font-mono`}
          placeholder="30 4 * * 1"
          value={state.cronText}
          onChange={(event) => set("cronText", event.target.value)}
          title="Standard crontab: minute hour day month weekday"
        />
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className={`${buttonClass} w-auto px-4`}
      >
        {saving ? "Saving..." : "Save schedule"}
      </button>
      {invalid && <span className="text-xs text-red-400">Invalid schedule</span>}
    </div>
  );
}
