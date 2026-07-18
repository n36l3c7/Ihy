/** Split a multi-value text field on ";" into clean values. */
export function splitListField(value: string): string[] {
  return value
    .split(";")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

export function joinListField(values: { name: string }[]): string {
  return values.map((value) => value.name).join("; ");
}

/** null when cleared, number when valid, undefined when unchanged/invalid. */
export function parseNumberField(value: string, initial: string): number | null | undefined {
  if (value === initial) return undefined;
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

/** null when cleared, string when set, undefined when unchanged. */
export function parseTextField(value: string, initial: string): string | null | undefined {
  if (value === initial) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** null when cleared, array when set, undefined when unchanged. */
export function parseListField(value: string, initial: string): string[] | null | undefined {
  if (value === initial) return undefined;
  const values = splitListField(value);
  return values.length === 0 ? null : values;
}
