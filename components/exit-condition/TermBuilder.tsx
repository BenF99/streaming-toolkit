"use client";

import { useCallback, useId } from "react";
import { ARITHMETIC_OPS, CONSTANTS, type ArithmeticOp, type SelValueType } from "@/lib/exit-condition/catalog";
import { constantsProducing, countedChain, defaultTermForTypes, emptyChain, emptyNumberTerm, emptyTerm, isStaticTerm, liveCondition, liveNumberTerm, termOutputType, type TermNode } from "@/lib/exit-condition/model";
import { termProblem } from "@/lib/exit-condition/validity";
import { PLAIN_CONSTANTS } from "@/lib/exit-condition/plain";
import { ChainBuilder } from "./ChainBuilder";
import { Chip, Menu, MenuGroupLabel, MenuItem, MenuTrigger, ButtonSubtle, NameWithGloss, ProblemNote } from "@/components/ui/primitives";
import { IconCalculate, IconCheck } from "@/components/ui/icons";
import { ConditionRow } from "./ConditionRow";

const ARITHMETIC_OP_DISPLAY: Record<ArithmeticOp, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };
const LITERAL_TYPE_LABEL = { string: "custom text", number: "a number", boolean: "true/false" } as const;

/** Whatever was already built carries into a new calculation rather than being replaced:
 * a stream list gets count() applied, a number stays as the first operand. */
function calculationSeed(term: TermNode): { left: TermNode; right: TermNode } {
  if (term.kind === "chain") {
    const type = termOutputType(term);
    if (type === "number") return { left: term, right: emptyNumberTerm() };
    if (type === "streams") return { left: { kind: "chain", chain: countedChain(term.chain) }, right: emptyNumberTerm() };
  }
  // A fixed left number needs a live right side, or the picker would offer a second fixed value.
  if (term.kind === "literal" && term.valueType === "number" && term.value.trim() !== "") {
    return { left: term, right: liveNumberTerm() };
  }
  return { left: liveNumberTerm(), right: emptyNumberTerm() };
}

interface TermBuilderProps {
  term: TermNode;
  onChange: (term: TermNode) => void;
  label?: string;
  /** Restrict constant/literal choices to these SEL types (e.g. ["number"] inside a
   * calculation, ["stringArray"] on the right of `in`). Omit for no restriction. */
  restrictType?: SelValueType[];
  /** Calculation/ternary levels deep. Both are only offered at depth 0, so they can't nest. */
  depth?: number;
  /** Withhold fixed-value options, offering only constants - set when the sibling operand is
   * already fixed, so two fixed values (arithmetic the user could do in their head) is unreachable. */
  requireLive?: boolean;
}

export function TermBuilder({ term, onChange, label, restrictType, depth = 0, requireLive = false }: TermBuilderProps) {
  const inputId = useId();
  // Includes constants that only *reach* the required type via a function - totalStreams belongs
  // in a number slot because count() gets it there.
  const constants = restrictType ? constantsProducing(restrictType) : CONSTANTS;
  const literalTypes = requireLive ? [] : (["string", "number", "boolean"] as const).filter((t) => !restrictType || restrictType.includes(t));
  // A number list (avg/max/etc.) has too many routes to a number to auto-seed; a stream list
  // has exactly one (count), so calculation offers to count it first.
  const carriesToNumber = term.kind !== "chain" || termOutputType(term) === "number" || termOutputType(term) === "streams";
  const willCountFirst = term.kind === "chain" && termOutputType(term) === "streams";
  const canOfferCalculation = depth === 0 && (!restrictType || restrictType.includes("number")) && carriesToNumber;
  const canOfferTernary = depth === 0;
  // Flat chips for a restricted (small) option set; a popover for the fully-open picker.
  const useChips = !!restrictType;
  const problem = termProblem(term);

  // Focus only a value box that mounts empty. Plain `autoFocus` would steal the caret out of the
  // expression box mid-paste, since a pasted expression mounts one of these per threshold.
  const focusIfBlank = useCallback((node: HTMLInputElement | null) => {
    if (node && node.value === "") node.focus();
  }, []);

  function pickConstant(id: string) {
    onChange({ kind: "chain", chain: emptyChain(id) });
  }
  function pickLiteral(valueType: "string" | "number" | "boolean") {
    onChange({ kind: "literal", valueType, value: "" });
  }

  return (
    <div className="flex flex-col gap-2">
      {label && <span className="text-[11px] font-medium text-text-tertiary">{label}</span>}

      {(term.kind === "chain" || term.kind === "literal") && (
        <>
          {useChips ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {constants.map((c) => (
                <Chip
                  key={c.id}
                  tone="accent"
                  className="font-mono"
                  selected={term.kind === "chain" && term.chain.sourceId === c.id}
                  title={`${PLAIN_CONSTANTS[c.id]?.label ?? c.label}: ${c.description}`}
                  onClick={() => pickConstant(c.id)}
                >
                  {c.label}
                </Chip>
              ))}
              {literalTypes.map((t) => (
                <Chip key={t} tone="accent" selected={term.kind === "literal" && term.valueType === t} onClick={() => pickLiteral(t)}>
                  {LITERAL_TYPE_LABEL[t]}
                </Chip>
              ))}
            </div>
          ) : (
            <Menu
              trigger={
                <MenuTrigger className={term.kind === "chain" ? "font-mono" : ""}>
                  {term.kind === "chain" ? term.chain.sourceId : `“${term.value || "…"}”`}
                </MenuTrigger>
              }
            >
              {(close) => (
                <div className="flex flex-col">
                  <MenuGroupLabel>What to look at</MenuGroupLabel>
                  {constants.map((c) => (
                    <MenuItem
                      key={c.id}
                      description={c.description}
                      onSelect={() => {
                        pickConstant(c.id);
                        close();
                      }}
                    >
                      <NameWithGloss name={c.label} gloss={PLAIN_CONSTANTS[c.id]?.label} />
                      {term.kind === "chain" && term.chain.sourceId === c.id && <IconCheck className="h-3 w-3 shrink-0 text-accent" />}
                    </MenuItem>
                  ))}
                  {literalTypes.length > 0 && (
                    <>
                      <MenuGroupLabel>Or type a value</MenuGroupLabel>
                      <MenuItem
                        onSelect={() => {
                          pickLiteral("string");
                          close();
                        }}
                      >
                        <span className="text-[13px]">Something I type myself</span>
                        {term.kind === "literal" && <IconCheck className="h-3 w-3 text-accent" />}
                      </MenuItem>
                    </>
                  )}
                </div>
              )}
            </Menu>
          )}

          {term.kind === "chain" ? (
            <ChainBuilder chain={term.chain} hideSource onChange={(chain) => onChange({ kind: "chain", chain })} />
          ) : (
            <div className="flex w-fit max-w-full flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
              {!useChips && literalTypes.length > 1 && (
                <div className="flex gap-1.5">
                  {literalTypes.map((t) => (
                    <Chip key={t} selected={term.valueType === t} onClick={() => pickLiteral(t)}>
                      {t}
                    </Chip>
                  ))}
                </div>
              )}
              {term.valueType === "boolean" ? (
                <Chip tone="accent" selected={term.value === "true"} onClick={() => onChange({ kind: "literal", valueType: "boolean", value: term.value === "true" ? "false" : "true" })}>
                  {term.value === "true" ? "true" : "false"}
                </Chip>
              ) : (
                <input
                  id={inputId}
                  name={inputId}
                  type="text"
                  autoComplete="off"
                  aria-label={label ?? `Custom ${term.valueType} value`}
                  ref={focusIfBlank}
                  value={term.value}
                  inputMode={term.valueType === "number" ? "numeric" : "text"}
                  placeholder={term.valueType === "number" ? "0" : "value"}
                  onChange={(e) => onChange({ kind: "literal", valueType: term.valueType, value: e.target.value })}
                  className="h-8 w-32 rounded-full border border-border bg-surface px-3 text-[13px] text-text outline-none focus-visible:border-accent"
                />
              )}
            </div>
          )}

          {(canOfferCalculation || canOfferTernary) && (
            <div className="flex flex-wrap gap-1.5">
              {canOfferCalculation && (
                <ButtonSubtle
                  onClick={() => onChange({ kind: "arithmetic", op: "+", ...calculationSeed(term) })}
                  title={willCountFirst ? "Count these streams, then do maths on the number" : "Combine two numbers with +, −, ×, or ÷"}
                >
                  <IconCalculate /> Calculation
                </ButtonSubtle>
              )}
              {canOfferTernary && (
                <ButtonSubtle
                  onClick={() =>
                    onChange({
                      kind: "ternary",
                      condition: liveCondition(),
                      then: term,
                      else: defaultTermForTypes([termOutputType(term)]),
                    })
                  }
                  title="Pick between two values based on a condition"
                >
                  If / then / else
                </ButtonSubtle>
              )}
            </div>
          )}
        </>
      )}

      {term.kind === "arithmetic" && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3">
          <TermBuilder depth={depth + 1} restrictType={["number"]} requireLive={isStaticTerm(term.right)} term={term.left} onChange={(t) => onChange({ ...term, left: t })} label="First number" />
          <div className="flex gap-1.5 self-center">
            {ARITHMETIC_OPS.map((op) => (
              <Chip key={op.id} tone="accent" selected={term.op === op.id} onClick={() => onChange({ ...term, op: op.id })}>
                {ARITHMETIC_OP_DISPLAY[op.id]}
              </Chip>
            ))}
          </div>
          <TermBuilder depth={depth + 1} restrictType={["number"]} requireLive={isStaticTerm(term.left)} term={term.right} onChange={(t) => onChange({ ...term, right: t })} label="Second number" />
          {problem && <ProblemNote problem={problem} />}
          <ButtonSubtle className="self-start" onClick={() => onChange(emptyTerm())}>
            Remove calculation
          </ButtonSubtle>
        </div>
      )}

      {term.kind === "ternary" && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-text-tertiary">If</span>
            <ConditionRow
              condition={term.condition}
              index={0}
              showLabel={false}
              depth={depth + 1}
              onChange={(condition) => onChange({ ...term, condition })}
            />
          </div>
          {/* "Otherwise" only offers what matches "then"'s type, and follows it when it changes. */}
          <TermBuilder
            depth={depth + 1}
            restrictType={restrictType}
            term={term.then}
            label="Then use"
            onChange={(t) =>
              onChange({
                ...term,
                then: t,
                else: termOutputType(t) === termOutputType(term.else) ? term.else : defaultTermForTypes([termOutputType(t)]),
              })
            }
          />
          <TermBuilder depth={depth + 1} restrictType={[termOutputType(term.then)]} term={term.else} onChange={(t) => onChange({ ...term, else: t })} label="Otherwise use" />
          {problem && <ProblemNote problem={problem} />}
          <ButtonSubtle className="self-start" onClick={() => onChange(term.then)}>
            Remove if / then / else
          </ButtonSubtle>
        </div>
      )}
    </div>
  );
}
