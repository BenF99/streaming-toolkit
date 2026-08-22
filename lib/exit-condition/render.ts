import { getFunction } from "./catalog";
import type { ArgValue, BuilderState, Chain, ChainStep, Condition, TermNode } from "./model";

/** A value not yet entered. Renders honestly as a gap, not as `0`/`''`, which read as decisions. */
const UNFILLED = "…";

function quoteString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function isNumeric(value: string): boolean {
  return value.trim() !== "" && !Number.isNaN(Number(value));
}

/** Render a scalar arg value as a SEL literal (numbers bare, everything else quoted). */
function renderScalar(value: string, argType: "number" | "string" | "boolean"): string {
  if (argType === "number") return isNumeric(value) ? value : "0";
  if (argType === "boolean") return value === "true" ? "true" : "false";
  return quoteString(value);
}

function renderArg(argValue: ArgValue | undefined, argType: "number" | "string" | "boolean" | "streams"): string | null {
  if (!argValue) return null;
  if (argValue.kind === "scalar") {
    if (argValue.value.trim() === "") return null;
    return renderScalar(argValue.value, argType === "streams" ? "string" : argType);
  }
  if (argValue.kind === "list") {
    const vals = argValue.values.filter((v) => v.trim() !== "");
    if (vals.length === 0) return null;
    return vals.map((v) => renderScalar(v, argType === "streams" ? "string" : argType)).join(", ");
  }
  if (argValue.kind === "chain") {
    return renderChain(argValue.chain);
  }
  if (argValue.kind === "chainList") {
    const parts = argValue.chains.map((c) => renderChain(c)).filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  return null;
}

export function renderChainStep(piped: string, step: ChainStep): string {
  const fn = getFunction(step.fnId);
  const pipedIndex = fn.pipedArgIndex ?? 0;
  // Walk declared arg specs positionally, substituting the piped slot as we go.
  const rendered: string[] = [];
  let specIdx = 0;
  for (let pos = 0; pos <= fn.args.length; pos++) {
    if (pos === pipedIndex) {
      rendered.push(piped);
    }
    if (specIdx >= fn.args.length) continue;
    const spec = fn.args[specIdx];
    specIdx++;
    const raw = renderArg(step.args[spec.name], spec.type);
    if (raw !== null) rendered.push(raw);
    // Missing required args still render as something, so a half-built chain stays parseable.
    else if (spec.required) rendered.push(UNFILLED);
  }
  return `${fn.label}(${rendered.join(", ")})`;
}

/** A function's args, compact enough for a collapsed row. Unquoted - a label, not copyable SEL. */
export function stepArgSummary(step: ChainStep): string {
  const parts: string[] = [];
  for (const spec of getFunction(step.fnId).args) {
    const value = step.args[spec.name];
    if (!value) continue;
    if (value.kind === "scalar" && value.value.trim() !== "") parts.push(value.value);
    else if (value.kind === "list") {
      const vals = value.values.filter((v) => v.trim() !== "");
      if (vals.length) parts.push(vals.join(", "));
    } else if (value.kind === "chain") parts.push(renderChain(value.chain));
    else if (value.kind === "chainList") {
      const chains = value.chains.map((c) => renderChain(c)).filter(Boolean);
      if (chains.length) parts.push(chains.join(", "));
    }
  }
  return parts.join(", ");
}

export function renderChain(chain: Chain): string {
  let expr = chain.sourceId;
  for (const step of chain.steps) {
    expr = renderChainStep(expr, step);
  }
  return expr;
}

export function renderTerm(term: TermNode): string {
  switch (term.kind) {
    case "chain":
      return renderChain(term.chain);
    case "literal": {
      if (term.value.trim() === "") return term.valueType === "boolean" ? "false" : UNFILLED;
      if (term.valueType === "number") return isNumeric(term.value) ? term.value : "0";
      if (term.valueType === "boolean") return term.value === "true" ? "true" : "false";
      return quoteString(term.value);
    }
    case "arithmetic":
      return `${renderTerm(term.left)} ${term.op} ${renderTerm(term.right)}`;
    case "ternary":
      // Always parenthesized: SEL's ternary binds looser than comparison/arithmetic.
      return `(${renderCondition(term.condition)} ? ${renderTerm(term.then)} : ${renderTerm(term.else)})`;
  }
}

export function renderCondition(cond: Condition): string {
  const left = renderTerm(cond.left);
  let body: string;
  if (cond.op) {
    const right = renderTerm(cond.right);
    // `includes` swaps back to `in`'s only spelling on the way out.
    body = cond.op === "includes" ? `${right} in ${left}` : `${left} ${cond.op} ${right}`;
  } else {
    body = left;
  }
  // Spaced so `not (...)` doesn't read as a function call next to count(...)/negate(...).
  return cond.negate ? `not (${body})` : body;
}

export function renderExpression(state: BuilderState): string {
  const conditionsStr = state.conditions.map((c) => renderCondition(c));
  const combined =
    conditionsStr.length <= 1
      ? conditionsStr[0] ?? ""
      : conditionsStr.map((c) => (c.includes(" ") ? `(${c})` : c)).join(` ${state.joiner} `);

  if (state.name.trim()) {
    return `/* ${state.name.trim()} */ ${combined}`;
  }
  return combined;
}

