"use client";

import { useState } from "react";
import { COMPARISON_OPS, type ComparisonOp } from "@/lib/exit-condition/catalog";
import { comparisonOpsForType, countedChain, defaultTermForTypes, emptyTerm, requiredTypesFor, termOutputType, type Condition } from "@/lib/exit-condition/model";
import { renderCondition } from "@/lib/exit-condition/render";
import { conditionProblem, conditionProblemDeep, hasTermProblem, needsComparison } from "@/lib/exit-condition/validity";
import { ButtonSubtle, Chip, Disclosure, Menu, MenuItem, MenuTrigger, NameWithGloss, Note, ProblemNote } from "@/components/ui/primitives";
import { IconClose, IconPlus } from "@/components/ui/icons";
import { TermBuilder } from "./TermBuilder";

interface ConditionRowProps {
  condition: Condition;
  onChange: (condition: Condition) => void;
  onRemove?: () => void;
  index: number;
  showLabel: boolean;
  /** See TermBuilder's depth. */
  depth?: number;
}

export function ConditionRow({ condition, onChange, onRemove, index, showLabel, depth = 0 }: ConditionRowProps) {
  // Only a titled, top-level condition collapses; nesting inside a ternary's "if" has no title bar.
  const [open, setOpen] = useState(true);
  const collapsed = showLabel && !open;
  const leftType = termOutputType(condition.left);
  const availableOps = comparisonOpsForType(leftType);
  const canCompare = availableOps.length > 0;
  const hasComparison = condition.op !== null;
  // Suppressed when a nested control already shows a more specific message for the same flaw.
  const nestedProblem = hasTermProblem(condition.left) || (condition.op !== null && hasTermProblem(condition.right));
  const problem = nestedProblem ? null : conditionProblem(condition);
  // For the collapsed state, where the control that'd normally carry the message is hidden.
  const deepProblem = collapsed ? conditionProblemDeep(condition) : null;

  function handleLeftChange(next: Condition["left"]) {
    const changedType = termOutputType(next) !== leftType;
    onChange(changedType ? { ...condition, left: next, op: null, right: emptyTerm() } : { ...condition, left: next });
  }

  /** Appends count() and opens the comparison in one move, instead of hunting count() in a
   * 40-entry function menu. */
  function countAndCompare() {
    if (condition.left.kind !== "chain") return;
    onChange({
      ...condition,
      left: { kind: "chain", chain: countedChain(condition.left.chain) },
      op: ">=",
      right: { kind: "literal", valueType: "number", value: "" },
    });
  }

  function pickOp(op: ComparisonOp) {
    const required = requiredTypesFor(op, leftType);
    const rightStillValid = required.includes(termOutputType(condition.right));
    onChange({ ...condition, op, right: rightStillValid ? condition.right : defaultTermForTypes(required) });
  }

  // Mono: a SEL keyword, like the constants/functions/operators.
  const notToggle = (
    <Chip
      className="font-mono"
      selected={condition.negate}
      onClick={() => onChange({ ...condition, negate: !condition.negate })}
      title="Flip this condition's answer. Different from the negate function, which removes streams from a list."
    >
      not
    </Chip>
  );

  /** Shown only while inversion is on - the moment the not/negate distinction matters. */
  const invertedNote = condition.negate && !collapsed && (
    <Note>Inverted: true whenever everything below is false.</Note>
  );

  return (
    <div className="flex flex-col gap-3">
      {showLabel && (
        <div className="flex items-center gap-3">
          <Disclosure open={open} onToggle={() => setOpen((v) => !v)} label={`condition ${index + 1}`} />
          <span className="shrink-0 text-[13px] font-semibold text-text">Condition {index + 1}</span>
          {/* Collapsed summary: the same SEL text the readout shows. */}
          {collapsed && (
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-text-tertiary" title={renderCondition(condition)}>
              {renderCondition(condition)}
            </span>
          )}
          <div className={`flex items-center gap-1 ${collapsed ? "" : "ml-auto"}`}>
            {!collapsed && notToggle}
            {onRemove && (
              <button type="button" onClick={onRemove} aria-label="Remove condition" className="ml-1 text-text-tertiary hover:text-danger">
                <IconClose className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {invertedNote}

      {/* A fault is never folded away with the rest of the card. */}
      {deepProblem && <ProblemNote problem={deepProblem} />}

      {!collapsed && (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-text-tertiary">Value</span>
          {!showLabel && notToggle}
        </div>
        <TermBuilder depth={depth} term={condition.left} onChange={handleLeftChange} />
      </div>
      )}

      {collapsed ? null : hasComparison ? (
        <div className="flex flex-col gap-2 border-l-2 border-border-strong pl-4 pt-1">
          <div className="flex items-center gap-2">
            <Menu trigger={<MenuTrigger className="font-mono">{COMPARISON_OPS.find((o) => o.id === condition.op)?.label ?? condition.op}</MenuTrigger>}>
              {(close) => (
                <div className="flex flex-col">
                  {availableOps.map((opId) => {
                    const op = COMPARISON_OPS.find((o) => o.id === opId)!;
                    return (
                      <MenuItem
                        key={op.id}
                        description={op.description}
                        onSelect={() => {
                          pickOp(op.id);
                          close();
                        }}
                      >
                        <NameWithGloss name={op.label} gloss={op.plain} />
                      </MenuItem>
                    );
                  })}
                </div>
              )}
            </Menu>
            <button type="button" onClick={() => onChange({ ...condition, op: null })} aria-label="Remove comparison" className="text-text-tertiary hover:text-danger">
              <IconClose className="h-3 w-3" />
            </button>
          </div>
          <TermBuilder depth={depth} restrictType={requiredTypesFor(condition.op!, leftType)} term={condition.right} onChange={(right) => onChange({ ...condition, right })} label="Compared to" />
        </div>
      ) : canCompare ? (
        <div className="flex flex-col gap-1.5">
          <ButtonSubtle className="self-start" onClick={() => pickOp(availableOps[0])}>
            <IconPlus /> Add comparison
          </ButtonSubtle>
          {needsComparison(condition) && <Note>A calculation on its own is always true. Compare it to something.</Note>}
        </div>
      ) : leftType === "streams" ? (
        <div className="flex flex-col gap-1.5">
          {/* Counting only works on a chain; a non-chain stream list (e.g. from a ternary) is fine as-is. */}
          {condition.left.kind === "chain" ? (
            <>
              <ButtonSubtle className="self-start" onClick={countAndCompare} title="Wrap this in count() and compare it to a number">
                <IconPlus /> Count them
              </ButtonSubtle>
              <Note>That&apos;s the list, not how many. Count it to compare a number; as-is it&apos;s true whenever the list isn&apos;t empty.</Note>
            </>
          ) : (
            <Note>This is a list of streams, so it&apos;s true whenever that list isn&apos;t empty.</Note>
          )}
        </div>
      ) : (
        <Note>
          {leftType === "numberArray"
            ? "A list of numbers. Wrap it in avg(), max() or median() above to compare a single value."
            : "This value can't be compared. Leave it, or pick a different one above."}
        </Note>
      )}

      {!collapsed && problem && <ProblemNote problem={problem} />}
    </div>
  );
}
