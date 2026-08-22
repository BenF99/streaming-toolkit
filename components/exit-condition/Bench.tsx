"use client";

import { useMemo, useRef, useState } from "react";
import { renderExpression } from "@/lib/exit-condition/render";
import { isStateComplete, stateProblem } from "@/lib/exit-condition/validity";
import { defaultSource } from "@/lib/exit-condition/model";
import { expressionReadback } from "@/lib/exit-condition/english";
import { parseExpression } from "@/lib/exit-condition/parse";
import { initialBuilderState, liveCondition, type BuilderState } from "@/lib/exit-condition/model";
import { Readout } from "./Readout";
import { Sentence } from "./Sentence";
import { ConditionRow } from "./ConditionRow";
import { ButtonStructural, Card, Chip } from "@/components/ui/primitives";
import { IconExternal, IconPlus } from "@/components/ui/icons";

function JoinerDivider({ joiner, onChange }: { joiner: "and" | "or"; onChange: (j: "and" | "or") => void }) {
  return (
    <div className="flex items-center gap-3 px-1" role="group" aria-label="Join with">
      <div className="h-px flex-1 bg-border" />
      <div className="flex items-center gap-1.5">
        <Chip tone="accent" selected={joiner === "and"} onClick={() => onChange("and")}>
          and
        </Chip>
        <Chip tone="accent" selected={joiner === "or"} onClick={() => onChange("or")}>
          or
        </Chip>
      </div>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export function Bench() {
  const [state, setState] = useState<BuilderState>(initialBuilderState);

  const expression = useMemo(() => renderExpression(state), [state]);
  const complete = useMemo(() => isStateComplete(state), [state]);
  const problem = useMemo(() => stateProblem(state), [state]);
  const readback = useMemo(() => expressionReadback(state), [state]);
  const empty = state.conditions.length === 0;

  // Only the condition the user just added animates in. Applying the entrance to every card would
  // turn the first paint into page-load choreography, which this surface has not earned.
  const [enteringId, setEnteringId] = useState<string | null>(null);

  /** The tree as it stood before the expression box was opened for editing, for Escape to restore. */
  const beforeEdit = useRef<BuilderState | null>(null);

  /** The expression box is editable, so the tree can arrive from typed or pasted SEL too. */
  function applyExpression(text: string): { ok: true } | { ok: false; error: string } {
    const result = parseExpression(text);
    if (!result.ok) return { ok: false, error: result.error };
    setState(result.state);
    return { ok: true };
  }

  function cancelExpressionEdit() {
    if (beforeEdit.current) setState(beforeEdit.current);
    beforeEdit.current = null;
  }

  function addCondition() {
    const cond = liveCondition(defaultSource());
    setEnteringId(cond.id);
    setState({ ...state, conditions: [...state.conditions, cond] });
  }

  return (
    <>
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[clamp(26px,4vw,30px)] font-semibold tracking-tight text-text">Exit Condition Builder</h1>
        <p className="max-w-xl text-[14px] leading-relaxed text-text-secondary">
          Build an AIOStreams Dynamic Exit Condition by picking values instead of writing syntax. It runs after each addon responds, to decide whether to stop querying the rest.
        </p>
      </header>

      {/* On wide screens the sentence is a rail beside the builder; narrow, it sits under the
          readout it restates. 332px = 300px readable + the rail's 32px padding. */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_332px] lg:items-start">
        <div className="lg:col-start-1 lg:row-start-1">
          <Readout value={expression} complete={complete} problem={problem} name={state.name} onNameChange={(name) => setState({ ...state, name })} onEdit={applyExpression} onEditStart={() => (beforeEdit.current = state)} onEditCancel={cancelExpressionEdit} onReset={empty && state.name.trim() === "" ? undefined : () => setState(initialBuilderState())} />
        </div>

        {/* The left rule gives the rail a region to belong to, not a lone card in empty space. */}
        <aside className="lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:h-full lg:border-l lg:border-border lg:pl-8">
          <div className="flex flex-col gap-4 lg:sticky lg:top-8">
            <Sentence readback={readback} />
            <a
              href="https://docs.aiostreams.viren070.me/reference/stream-expressions/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 self-start px-1 text-[13px] font-medium text-accent hover:underline"
            >
              SEL reference <IconExternal className="h-2.5 w-2.5" />
            </a>
          </div>
        </aside>

        <div className="flex flex-col gap-3 lg:col-start-1 lg:row-start-2">
        {/* The first move on the page, and the only one offered until it is made. */}
        {empty && (
          <Card className="flex flex-col items-start gap-3 border-dashed p-5">
            <p className="max-w-prose text-[13px] leading-relaxed text-text-secondary">
              Compare something about the search so far, like how many streams have come back, against a threshold you choose. Or paste an expression into the box above.
            </p>
            <ButtonStructural onClick={addCondition}>
              <IconPlus className="h-3 w-3" /> Add a condition
            </ButtonStructural>
          </Card>
        )}

        {/* Every condition is a titled card from the first one onward - one condition is a list of one. */}
        {state.conditions.map((cond, i) => (
          <div
            key={cond.id}
            onAnimationEnd={() => cond.id === enteringId && setEnteringId(null)}
            className={`flex flex-col gap-3 ${cond.id === enteringId ? "animate-card-in" : ""}`}
          >
            {i > 0 && <JoinerDivider joiner={state.joiner} onChange={(joiner) => setState({ ...state, joiner })} />}
            <Card className="p-4">
              <ConditionRow
                condition={cond}
                index={i}
                showLabel
                onChange={(next) => {
                  const copy = state.conditions.slice();
                  copy[i] = next;
                  setState({ ...state, conditions: copy });
                }}
                onRemove={() => setState({ ...state, conditions: state.conditions.filter((_, j) => j !== i) })}
              />
            </Card>
          </div>
        ))}

          {!empty && (
            <ButtonStructural className="self-start" onClick={addCondition}>
              <IconPlus className="h-3 w-3" /> Add another condition
            </ButtonStructural>
          )}
        </div>
      </div>

      {/* No top rule - the rail already uses one to mean "region boundary"; reusing it here for
          "page ends" would blur the two meanings. */}
      <footer className="pt-4 text-[12px] text-text-tertiary">
        <span>Every function, operator, and constant comes from the AIOStreams SEL reference.</span>
      </footer>
    </>
  );
}
