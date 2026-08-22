"use client";

import type { Readback } from "@/lib/exit-condition/english";
import { Card } from "@/components/ui/primitives";
import { ChangingText } from "@/components/ui/ChangingText";

/** The expression read back in English, beside the builder so it stays visible. Answers whether
 * the expression is the one you *meant*, not whether it's valid (that's the readout). */
export function Sentence({ readback }: { readback: Readback | null }) {
  return (
    <Card className="p-4">
      <p className="pb-2 text-[11px] font-medium text-text-tertiary">In plain English</p>

      {readback === null ? (
        <p className="text-[14px] leading-relaxed text-text-tertiary">Add a condition to see it here.</p>
      ) : (
        <>
          <p className="text-[14px] leading-relaxed text-text">
            <ChangingText value={readback.lead} highlightClass="animate-highlight-plain" />
          </p>
          {readback.clauses.length > 0 && (
            <ul className="flex flex-col gap-2 pt-2">
              {readback.clauses.map((clause, i) => (
                <li key={i} className="flex gap-2 text-[14px] leading-relaxed text-text">
                  <span aria-hidden className="select-none pt-[2px] text-text-tertiary">
                    &middot;
                  </span>
                  <span className="min-w-0">
                    <ChangingText value={clause} highlightClass="animate-highlight-plain" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
