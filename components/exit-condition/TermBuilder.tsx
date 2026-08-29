"use client";

import { useCallback, useId } from "react";
import { ARITHMETIC_OPS, CONSTANTS, type ArithmeticOp, type SelValueType } from "@/lib/exit-condition/catalog";
import { constantsProducing, countedChain, defaultTermForTypes, emptyChain, emptyGroup, emptyNumberTerm, emptyTerm, isStaticTerm, liveCondition, liveNumberTerm, termOutputType, type TermNode } from "@/lib/exit-condition/model";
import { termProblem } from "@/lib/exit-condition/validity";
import { PLAIN_CONSTANTS } from "@/lib/exit-condition/plain";
import { ChainBuilder } from "./ChainBuilder";
import { Chip, Menu, MenuGroupLabel, MenuItem, MenuTrigger, ButtonSubtle, NameWithGloss, ProblemNote } from "@/components/ui/primitives";
import { IconCalculate, IconCheck, IconClose, IconPlus } from "@/components/ui/icons";
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

/** Keeps "otherwise" the same kind of value as "then". A group's boolean would technically match a
 * true/false literal, but answering a set of conditions with a bare `false` is never the intent. */
function matchingElse(then: TermNode, current: TermNode): TermNode {
  if (then.kind === "group") return current.kind === "group" ? current : emptyGroup();
  if (current.kind === "group") return defaultTermForTypes([termOutputType(then)]);
  return termOutputType(then) === termOutputType(current) ? current : defaultTermForTypes([termOutputType(then)]);
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
  /** Withhold constants entirely, offering only a typed input - set when every constant option
   * would be a category mismatch (e.g. comparing a stream count to totalTimeTaken). */
  literalOnly?: boolean;
  /** Offer a group of conditions as a value. Only a ternary branch sets this: anywhere else a
   * group is either the wrong type or just the top-level condition list with extra brackets. */
  allowGroup?: boolean;
}

export function TermBuilder({ term, onChange, label, restrictType, depth = 0, requireLive = false, literalOnly = false, allowGroup = false }: TermBuilderProps) {
  const inputId = useId();
  // Includes constants that only *reach* the required type via a function - totalStreams belongs
  // in a number slot because count() gets it there.
  const constants = literalOnly ? [] : restrictType ? constantsProducing(restrictType) : CONSTANTS;
  const literalTypes = requireLive ? [] : (["string", "number", "boolean"] as const).filter((t) => !restrictType || restrictType.includes(t));
  // With no constants and exactly one literal type, the picker row would just be a single
  // always-selected chip sitting above the input - skip it and show the input alone.
  const skipPicker = literalOnly && constants.length === 0 && literalTypes.length === 1;
  // A number list (avg/max/etc.) has too many routes to a number to auto-seed; a stream list
  // has exactly one (count), so calculation offers to count it first.
  const carriesToNumber = term.kind !== "chain" || termOutputType(term) === "number" || termOutputType(term) === "streams";
  const willCountFirst = term.kind === "chain" && termOutputType(term) === "streams";
  const canOfferCalculation = depth === 0 && (!restrictType || restrictType.includes("number")) && carriesToNumber;
  const canOfferTernary = depth === 0;
  const canOfferGroup = allowGroup && (!restrictType || restrictType.includes("boolean"));
  // Flat chips for a restricted (small) option set; a popover for the fully-open picker.
  const useChips = !!restrictType;
  // One-option picker reads as locked; show a label instead.
  const onlyOption = useChips && constants.length === 1 && literalTypes.length === 0 ? constants[0] : null;
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
          {skipPicker ? null : onlyOption ? (
            <span className="font-mono text-[13px] text-text-secondary" title={`${PLAIN_CONSTANTS[onlyOption.id]?.label ?? onlyOption.label}: ${onlyOption.description}`}>
              Starts from {onlyOption.label}
            </span>
          ) : useChips ? (
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

          {(canOfferCalculation || canOfferTernary || canOfferGroup) && (
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
                      condition: liveCondition(term.kind === "chain" ? term.chain.sourceId : undefined),
                      then: restrictType ? defaultTermForTypes(restrictType) : emptyTerm(),
                      else: restrictType ? defaultTermForTypes(restrictType) : emptyTerm(),
                    })
                  }
                  title="Pick between two values based on a condition"
                >
                  If / then / else
                </ButtonSubtle>
              )}
              {canOfferGroup && (
                <ButtonSubtle onClick={() => onChange(emptyGroup())} title="Use a set of conditions here instead of a single value">
                  Set of conditions
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
            allowGroup
            term={term.then}
            label="Then use"
            onChange={(t) => onChange({ ...term, then: t, else: matchingElse(t, term.else) })}
          />
          <TermBuilder depth={depth + 1} restrictType={[termOutputType(term.then)]} allowGroup term={term.else} onChange={(t) => onChange({ ...term, else: t })} label="Otherwise use" />
          {problem && <ProblemNote problem={problem} />}
          <ButtonSubtle className="self-start" onClick={() => onChange(term.then)}>
            Remove if / then / else
          </ButtonSubtle>
        </div>
      )}

      {term.kind === "group" && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-text-tertiary">True when</span>
            <Chip tone="accent" selected={term.joiner === "or"} onClick={() => onChange({ ...term, joiner: "or" })}>
              any
            </Chip>
            <Chip tone="accent" selected={term.joiner === "and"} onClick={() => onChange({ ...term, joiner: "and" })}>
              all
            </Chip>
            <span className="text-[11px] font-medium text-text-tertiary">of these hold</span>
          </div>
          {term.conditions.map((cond, i) => (
            <div key={cond.id} className="flex flex-col gap-2 border-l-2 border-border-strong pl-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-text-tertiary">{i === 0 ? "" : term.joiner}</span>
                {term.conditions.length > 2 && (
                  <button
                    type="button"
                    aria-label={`Remove condition ${i + 1} from the set`}
                    onClick={() => onChange({ ...term, conditions: term.conditions.filter((_, j) => j !== i) })}
                    className="text-text-tertiary hover:text-danger"
                  >
                    <IconClose className="h-3 w-3" />
                  </button>
                )}
              </div>
              <ConditionRow
                condition={cond}
                index={i}
                showLabel={false}
                depth={depth + 1}
                onChange={(next) => onChange({ ...term, conditions: term.conditions.map((c, j) => (j === i ? next : c)) })}
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-1.5">
            <ButtonSubtle onClick={() => onChange({ ...term, conditions: [...term.conditions, liveCondition()] })}>
              <IconPlus /> Add to the set
            </ButtonSubtle>
            <ButtonSubtle onClick={() => onChange(emptyTerm())}>Remove the set</ButtonSubtle>
          </div>
        </div>
      )}
    </div>
  );
}
