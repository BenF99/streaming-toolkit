import { getFunction, type SelValueType } from "./catalog";
import { isStaticCondition, isStaticTerm, requiredTypesFor, termOutputType } from "./model";
import type { Chain, Condition, TermNode, BuilderState } from "./model";
import { renderChain, renderTerm } from "./render";

export function isChainComplete(chain: Chain): boolean {
  if (chainProblem(chain) !== null) return false;
  for (const step of chain.steps) {
    const fn = getFunction(step.fnId);
    for (const spec of fn.args) {
      if (!spec.required) continue;
      const val = step.args[spec.name];
      if (!val) return false;
      if (val.kind === "scalar" && val.value.trim() === "") return false;
      if (val.kind === "list" && val.values.filter((v) => v.trim()).length === 0) return false;
      if (val.kind === "chain" && !isChainComplete(val.chain)) return false;
      if (val.kind === "chainList" && (val.chains.length === 0 || val.chains.some((c) => !isChainComplete(c)))) return false;
    }
  }
  return true;
}

/** The readout shows only `summary`; the note beside the offending control shows both. */
export interface SelProblem {
  /** One sentence naming what is wrong. */
  summary: string;
  /** What to do about it. */
  fix: string;
}

/** A logical flaw in one chain step, or null - the operands cancel each other out (verified
 * against negate/merge's implementation in streamExpression.ts). */
export function stepProblem(chain: Chain, index: number): SelProblem | null {
  const step = chain.steps[index];
  const piped = renderChain({ ...chain, steps: chain.steps.slice(0, index) });

  if (step.fnId === "negate") {
    const excluded = step.args["streamsToExclude"];
    if (excluded?.kind === "chain" && renderChain(excluded.chain) === piped) {
      return {
        summary: "Excluding a list from itself always leaves nothing, whatever the addons return.",
        fix: "Wrap the excluded list in a filter like quality or resolution so it isn't the same list.",
      };
    }
  }

  // Each bound is individually in range, so clamping alone can't catch min > max.
  for (const spec of getFunction(step.fnId).args) {
    if (!spec.noGreaterThan) continue;
    const lower = step.args[spec.name];
    const upper = step.args[spec.noGreaterThan];
    if (lower?.kind !== "scalar" || upper?.kind !== "scalar") continue;
    const lo = Number(lower.value);
    const hi = Number(upper.value);
    if (lower.value.trim() === "" || upper.value.trim() === "" || Number.isNaN(lo) || Number.isNaN(hi)) continue;
    if (lo > hi) {
      return {
        summary: `In ${getFunction(step.fnId).label}, the ${spec.name} is above the ${spec.noGreaterThan}, so nothing can fall inside that range.`,
        fix: `Set the ${spec.name} to ${hi} or below.`,
      };
    }
  }

  if (step.fnId === "merge") {
    const extra = step.args["streamArrays"];
    const lists = [piped, ...(extra?.kind === "chainList" ? extra.chains.map(renderChain) : [])];
    if (new Set(lists).size < lists.length) {
      return {
        summary: "The same list appears twice, and merging removes duplicates, so this changes nothing.",
        fix: "Merge a different list.",
      };
    }
  }

  return null;
}

/** The first flaw anywhere in a chain, including inside a nested stream argument. */
export function chainProblem(chain: Chain): SelProblem | null {
  for (let i = 0; i < chain.steps.length; i++) {
    const own = stepProblem(chain, i);
    if (own) return own;
    for (const arg of Object.values(chain.steps[i].args)) {
      if (arg.kind === "chain") {
        const nested = chainProblem(arg.chain);
        if (nested) return nested;
      }
      if (arg.kind === "chainList") {
        for (const c of arg.chains) {
          const nested = chainProblem(c);
          if (nested) return nested;
        }
      }
    }
  }
  return null;
}

/** A logical flaw in this node itself (not its children), or null. */
export function termProblem(term: TermNode): SelProblem | null {
  if (term.kind === "arithmetic") {
    if (isStaticTerm(term)) {
      return {
        summary: "Both sides of the calculation are fixed numbers, so it always works out to the same value.",
        fix: "Use totalTimeTaken, or count(totalStreams), on one side.",
      };
    }
    if (termOutputType(term.left) !== "number" || termOutputType(term.right) !== "number") {
      return {
        summary: "Each side of the calculation has to work out to a number.",
        fix: "Wrap a stream list in count() to turn it into one.",
      };
    }
  }
  if (term.kind === "ternary" && termOutputType(term.then) !== termOutputType(term.else)) {
    return {
      summary: "The two results are different kinds of value, so nothing downstream can handle both.",
      fix: "Pick results of the same kind for both branches.",
    };
  }
  return null;
}

/** The first problem anywhere in a term, innermost first - closest to the control that caused it. */
export function termProblemDeep(term: TermNode): SelProblem | null {
  switch (term.kind) {
    case "chain":
      return chainProblem(term.chain);
    case "literal":
      return null;
    case "arithmetic":
      return termProblemDeep(term.left) ?? termProblemDeep(term.right) ?? termProblem(term);
    case "ternary":
      return conditionProblemDeep(term.condition) ?? termProblemDeep(term.then) ?? termProblemDeep(term.else) ?? termProblem(term);
    case "group": {
      for (const cond of term.conditions) {
        const problem = conditionProblemDeep(cond);
        if (problem) return problem;
      }
      return termProblem(term);
    }
  }
}

/** The first problem anywhere in a condition, innermost first. */
export function conditionProblemDeep(cond: Condition): SelProblem | null {
  return termProblemDeep(cond.left) ?? (cond.op ? termProblemDeep(cond.right) : null) ?? conditionProblem(cond);
}

/** True when a nested control already reports its own problem, so the condition-level line stays quiet. */
export function hasTermProblem(term: TermNode): boolean {
  return termProblemDeep(term) !== null;
}

/** The one problem to show, or null when the expression is merely unfinished. */
export function stateProblem(state: BuilderState): SelProblem | null {
  for (const cond of state.conditions) {
    const problem = conditionProblemDeep(cond);
    if (problem) return problem;
  }
  return null;
}

/** True when a term can never be negative: count() is a length, totalTimeTaken is elapsed ms. */
function isNeverNegative(term: TermNode): boolean {
  if (term.kind !== "chain") return false;
  const last = term.chain.steps[term.chain.steps.length - 1];
  return last ? last.fnId === "count" : term.chain.sourceId === "totalTimeTaken";
}

/** A comparison whose answer is already known because the left side can never be negative. */
function alwaysDecidedComparison(cond: Condition): SelProblem | null {
  if (!cond.op || !isNeverNegative(cond.left)) return null;
  if (cond.right.kind !== "literal" || cond.right.valueType !== "number") return null;
  if (cond.right.value.trim() === "") return null;
  const n = Number(cond.right.value);
  if (Number.isNaN(n)) return null;

  const alwaysTrue = (cond.op === ">=" && n <= 0) || (cond.op === ">" && n < 0) || (cond.op === "!=" && n < 0);
  const alwaysFalse = (cond.op === "<" && n <= 0) || (cond.op === "<=" && n < 0) || (cond.op === "==" && n < 0);
  if (!alwaysTrue && !alwaysFalse) return null;

  const subject = renderTerm(cond.left);
  return {
    summary: `${subject} can never be negative, so this comparison is always ${alwaysTrue ? "true" : "false"}.`,
    fix: alwaysTrue ? "Compare against 1 or more, or use > 0 to mean “found at least one”." : "Compare against 0 or more.",
  };
}

export function conditionProblem(cond: Condition): SelProblem | null {
  if (isStaticCondition(cond)) {
    return {
      summary: "This reads nothing from the request, so it's always true or always false.",
      fix: "Use a value like totalStreams or totalTimeTaken on at least one side.",
    };
  }
  const decided = alwaysDecidedComparison(cond);
  if (decided) return decided;
  if (cond.op) {
    const required = requiredTypesFor(cond.op, termOutputType(cond.left));
    if (!required.includes(termOutputType(cond.right))) {
      return {
        summary: `The compared value has to be ${describeTypes(required)}.`,
        fix: "Pick a matching value on the right of the comparison.",
      };
    }
  }
  return null;
}

function describeTypes(types: SelValueType[]): string {
  const names: Record<SelValueType, string> = {
    streams: "a stream list",
    number: "a number",
    numberArray: "a list of numbers",
    string: "text",
    stringArray: "a list of text values",
    boolean: "true or false",
  };
  return types.map((t) => names[t]).join(" or ");
}

export function isTermComplete(term: TermNode): boolean {
  if (termProblem(term) !== null) return false;
  switch (term.kind) {
    case "chain":
      return isChainComplete(term.chain);
    case "literal":
      return term.value.trim() !== "";
    case "arithmetic":
      return isTermComplete(term.left) && isTermComplete(term.right);
    case "ternary":
      return isConditionComplete(term.condition) && isTermComplete(term.then) && isTermComplete(term.else);
    case "group":
      return term.conditions.length > 0 && term.conditions.every(isConditionComplete);
  }
}

/** A bare arithmetic term is always truthy and non-zero, so it needs a comparison to mean
 * anything. Unfinished, not a problem - the piece is simply missing. */
export function needsComparison(cond: Condition): boolean {
  return cond.op === null && cond.left.kind === "arithmetic";
}

export function isConditionComplete(cond: Condition): boolean {
  if (conditionProblem(cond) !== null) return false;
  if (!isTermComplete(cond.left)) return false;
  if (needsComparison(cond)) return false;
  if (!cond.op) return true;
  return isTermComplete(cond.right);
}

export function isStateComplete(state: BuilderState): boolean {
  if (state.conditions.length === 0) return false;
  return state.conditions.every(isConditionComplete);
}

