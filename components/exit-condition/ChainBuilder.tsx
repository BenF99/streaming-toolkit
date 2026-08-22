"use client";

import { useId, useState } from "react";

import { CONSTANTS, functionsForPipeType, getFunction, type SelFunction } from "@/lib/exit-condition/catalog";
import { chainOutputType, defaultStepArgs, emptyChain, nextId, removalCascades, removeStepAt, type Chain, type ChainStep } from "@/lib/exit-condition/model";
import { renderChain, stepArgSummary } from "@/lib/exit-condition/render";
import { stepProblem } from "@/lib/exit-condition/validity";
import { PLAIN_CONSTANTS, functionLabel, groupedFunctions, matchesQuery } from "@/lib/exit-condition/plain";
import { ArgInput } from "./ArgInput";
import { IconClose, IconPlus } from "@/components/ui/icons";
import { Disclosure, DisclosureSpacer, Menu, MenuGroupLabel, MenuItem, NameWithGloss, ProblemNote, structuralButtonClass } from "@/components/ui/primitives";

interface ChainBuilderProps {
  chain: Chain;
  onChange: (chain: Chain) => void;
  depth?: number;
  onRemove?: () => void;
  /** Suppress the leading source label: used when a wrapping TermBuilder already shows it. */
  hideSource?: boolean;
}

/** Grouped by what you're narrowing by (not the parser's utility/filter/math split), searchable. */
function FunctionMenu({ options, onPick }: { options: SelFunction[]; onPick: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const matches = options.filter((fn) => matchesQuery(fn, query));
  const groups = groupedFunctions(matches);

  return (
    <div className="flex flex-col">
      <div className="sticky -top-2 z-10 -mx-2 -mt-2 mb-1 bg-surface px-2 pb-1 pt-2">
        <input
          id={searchId}
          name={searchId}
          type="text"
          autoComplete="off"
          autoFocus
          aria-label="Search functions"
          value={query}
          placeholder="Search…"
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 w-full rounded-full border border-border bg-surface-2 px-3 text-[13px] text-text outline-none placeholder:text-text-tertiary focus-visible:border-accent"
        />
      </div>

      {groups.length === 0 && <p className="px-2.5 py-3 text-[12px] text-text-tertiary">Nothing matches “{query}”.</p>}

      {groups.map(({ group, fns }) => (
        <div key={group}>
          <MenuGroupLabel>{group}</MenuGroupLabel>
          {fns.map((fn) => (
            <MenuItem key={fn.id} description={fn.description} onSelect={() => onPick(fn.id)}>
              <NameWithGloss name={fn.label} gloss={functionLabel(fn.id)} />
            </MenuItem>
          ))}
        </div>
      ))}
    </div>
  );
}

export function ChainBuilder({ chain, onChange, depth = 0, onRemove, hideSource = false }: ChainBuilderProps) {
  const currentSource = CONSTANTS.find((c) => c.id === chain.sourceId);
  // Keyed by step id, so a freshly added function always arrives open.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  function toggleCollapsed(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  const outputType = chainOutputType(chain);
  const canAddStep = outputType === "streams" || outputType === "numberArray";
  const nextOptions = canAddStep ? functionsForPipeType(outputType) : [];

  function addStep(fnId: string) {
    const step: ChainStep = { id: nextId("step"), fnId, args: defaultStepArgs(fnId) };
    onChange({ ...chain, steps: [...chain.steps, step] });
  }

  function updateStepArgs(index: number, args: ChainStep["args"]) {
    const steps = chain.steps.slice();
    steps[index] = { ...steps[index], args };
    onChange({ ...chain, steps });
  }

  return (
    // A nested chain is a rail (not a box), so depth stays legible past one level.
    <div className={depth === 0 ? "flex flex-col gap-3" : "flex flex-col gap-2.5 border-l-2 border-border-strong pl-4"}>
      {/* One function per row, in the order they apply, each carrying its own arguments. */}
      <div className="flex flex-col">
        {!hideSource && (
          <div className="flex items-center gap-3 py-2">
            <span
              className="font-mono text-[13px] text-text-secondary"
              title={`${PLAIN_CONSTANTS[chain.sourceId]?.label ?? chain.sourceId}: ${currentSource?.description ?? ""}`}
            >
              {chain.sourceId}
            </span>
            {onRemove && (
              <button type="button" onClick={onRemove} aria-label="Remove nested stream list" className="ml-auto text-text-tertiary hover:text-danger">
                <IconClose className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {chain.steps.map((step, index) => {
          const fn = getFunction(step.fnId);
          const problem = stepProblem(chain, index);
          const cascades = removalCascades(chain, index);
          // A nested stream list gets its own line under the function, not squeezed into the row.
          const inlineArgs = fn.args.filter((a) => a.type !== "streams");
          const blockArgs = fn.args.filter((a) => a.type === "streams");
          const argControl = (spec: (typeof fn.args)[number]) => (
            <ArgInput key={spec.name} spec={spec} value={step.args[spec.name]} onChange={(v) => updateStepArgs(index, { ...step.args, [spec.name]: v })} depth={depth} />
          );

          const hasArgs = fn.args.length > 0;
          const isOpen = !collapsed.has(step.id);
          const summary = hasArgs && !isOpen ? stepArgSummary(step) : "";

          return (
            <div key={step.id} className="flex flex-col gap-2 border-t border-border py-2.5 first:border-t-0">
              <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                <span className="flex min-w-0 items-center gap-1.5 pt-1">
                  {hasArgs ? <Disclosure open={isOpen} onToggle={() => toggleCollapsed(step.id)} label={fn.label} /> : <DisclosureSpacer />}
                  <span className="font-mono text-[13px] text-accent" title={`${functionLabel(step.fnId)}: ${fn.description}`}>
                    {fn.label}
                  </span>
                  {/* Collapsed rows still say what they're set to. */}
                  {summary && <span className="truncate font-mono text-[12px] text-text-tertiary">{summary}</span>}
                </span>

                {isOpen && inlineArgs.map(argControl)}

                <button
                  type="button"
                  onClick={() => onChange(removeStepAt(chain, index))}
                  aria-label={cascades ? `Remove ${fn.label} and everything after it` : `Remove ${fn.label}`}
                  title={cascades ? `Also removes the functions after it, which need what it produces` : `Remove ${fn.label}`}
                  className="ml-auto mt-1 text-text-tertiary hover:text-danger"
                >
                  <IconClose className="h-3 w-3" />
                </button>
              </div>

              {isOpen && blockArgs.map(argControl)}
              {/* Never collapsed away - a fault stays visible. */}
              {problem && <ProblemNote problem={problem} />}
            </div>
          );
        })}
      </div>

      {canAddStep && (
        <Menu
          trigger={
            <span className={structuralButtonClass("self-start")}>
              <IconPlus className="h-3 w-3" /> Add a function
            </span>
          }
        >
          {(close) => (
            <FunctionMenu
              options={nextOptions}
              onPick={(id) => {
                addStep(id);
                close();
              }}
            />
          )}
        </Menu>
      )}

      <div className="font-mono text-[11px] text-text-tertiary">= {renderChain(chain)}</div>
    </div>
  );
}

export function newNestedChain(): Chain {
  const src = CONSTANTS.find((c) => c.type === "streams");
  return emptyChain(src ? src.id : "streams");
}
