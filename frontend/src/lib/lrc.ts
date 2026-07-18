export interface LrcLine {
  time: number; // seconds
  text: string;
}

const TIMESTAMP_RE = /\[(\d+):(\d+(?:\.\d+)?)\]/g;

/** Parse LRC synced lyrics into a time-sorted list of lines. */
export function parseLrc(lrc: string): LrcLine[] {
  const result: LrcLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const matches = [...raw.matchAll(TIMESTAMP_RE)];
    if (matches.length === 0) continue;
    const text = raw.replace(TIMESTAMP_RE, "").trim();
    if (!text) continue;
    for (const match of matches) {
      result.push({ time: Number(match[1]) * 60 + Number(match[2]), text });
    }
  }
  return result.sort((a, b) => a.time - b.time);
}

/** Index of the line currently being sung, -1 before the first line. */
export function activeLrcIndex(lines: LrcLine[], currentTime: number): number {
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= currentTime) {
      active = i;
    } else {
      break;
    }
  }
  return active;
}
