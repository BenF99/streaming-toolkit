// Locating what changed between two renderings, so the readout can point at it. Shared by both
// readings (SEL string and English sentence) so a single edit lights up in both.

export interface Range {
  start: number;
  end: number;
}

export function changedRanges(prev: string, next: string): Range[] {
  if (prev === next) return [];

  const max = Math.min(prev.length, next.length);
  let start = 0;
  while (start < max && prev[start] === next[start]) start += 1;
  let prevEnd = prev.length;
  let nextEnd = next.length;
  while (prevEnd > start && nextEnd > start && prev[prevEnd - 1] === next[nextEnd - 1]) {
    prevEnd -= 1;
    nextEnd -= 1;
  }

  const prevRest = prev.slice(start, prevEnd);
  if (prevRest.length > 0) {
    const at = next.slice(start, nextEnd).indexOf(prevRest);
    if (at !== -1) {
      return [
        { start, end: start + at },
        { start: start + at + prevRest.length, end: nextEnd },
      ].filter((r) => r.end > r.start);
    }
  }

  return nextEnd > start ? [{ start, end: nextEnd }] : [];
}

/** Split `value` into plain and highlighted runs, in order. */
export function segment(value: string, ranges: Range[]): { text: string; changed: boolean }[] {
  const parts: { text: string; changed: boolean }[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) parts.push({ text: value.slice(cursor, range.start), changed: false });
    parts.push({ text: value.slice(range.start, range.end), changed: true });
    cursor = range.end;
  }
  if (cursor < value.length) parts.push({ text: value.slice(cursor), changed: false });
  return parts;
}
