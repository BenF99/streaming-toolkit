"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { changedRanges, segment } from "@/lib/exit-condition/diff";

export function ChangingText({
  value,
  className,
  empty,
  // The dark code card and a light surface need different settling colours.
  highlightClass = "animate-highlight",
}: {
  value: string;
  className?: string;
  empty?: ReactNode;
  highlightClass?: string;
}) {
  // Keyed by a counter so an identical edit made twice still replays the highlight.
  const previous = useRef(value);
  const [highlight, setHighlight] = useState<{ ranges: { start: number; end: number }[]; key: number } | null>(null);
  const key = useRef(0);

  useEffect(() => {
    const ranges = changedRanges(previous.current, value);
    previous.current = value;
    if (ranges.length === 0) return;
    key.current += 1;
    setHighlight({ ranges, key: key.current });
  }, [value]);

  if (value === "") return <>{empty}</>;

  // A highlight computed for an earlier string must never index into a newer, shorter one.
  const usable = highlight !== null && highlight.ranges.every((r) => r.end <= value.length);
  if (!usable) return <span className={className}>{value}</span>;

  return (
    <span className={className}>
      {segment(value, highlight.ranges).map((part, i) =>
        part.changed ? (
          <span key={`${highlight.key}-${i}`} className={highlightClass}>
            {part.text}
          </span>
        ) : (
          <span key={`${highlight.key}-${i}`}>{part.text}</span>
        ),
      )}
    </span>
  );
}
