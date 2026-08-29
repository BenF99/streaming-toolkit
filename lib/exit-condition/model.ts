import { CONSTANTS, getFunction, reachableTypes, type ArithmeticOp, type ComparisonOp, type SelConstant, type SelValueType } from "./catalog";

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}-${Math.random().toString(36).slice(2, 7)}`;
}

/** One step of a nested chain: wraps the previous value in a function call. */
export interface ChainStep {
  id: string;
  fnId: string;
  /** Values for each of the function's non-piped args, keyed by arg name. */
  args: Record<string, ArgValue>;
}

/** A value plugged into a function argument. */
export type ArgValue =
  | { kind: "scalar"; value: string }
  | { kind: "list"; values: string[] }
  | { kind: "chain"; chain: Chain }
  | { kind: "chainList"; chains: Chain[] };

/** A linear sequence of function calls starting from a context constant. */
export interface Chain {
  id: string;
  sourceId: string;
  steps: ChainStep[];
}

export function emptyChain(sourceId: string): Chain {
  return { id: nextId("chain"), sourceId, steps: [] };
}

/** The SEL type flowing out of a chain, at a given step (default: after every step). */
export function chainOutputType(chain: Chain, uptoIndex: number = chain.steps.length): SelValueType {
  let t: SelValueType = CONSTANTS.find((c) => c.id === chain.sourceId)?.type ?? "streams";
  for (let i = 0; i < uptoIndex; i++) {
    t = getFunction(chain.steps[i].fnId).returns;
  }
  return t;
}

/** A value: a chain, a literal, a calculation, a ternary, or a parenthesised group of conditions.
 * Arithmetic/ternary/group are term kinds, not a separate mode, so any can appear anywhere a
 * term can. A group evaluates to a boolean, which is what lets a ternary choose between two
 * sets of conditions rather than two plain values. */
export type TermNode =
  | { kind: "chain"; chain: Chain }
  | { kind: "literal"; valueType: "number" | "string" | "boolean"; value: string }
  | { kind: "arithmetic"; op: ArithmeticOp; left: TermNode; right: TermNode }
  | { kind: "ternary"; condition: Condition; then: TermNode; else: TermNode }
  | { kind: "group"; joiner: "and" | "or"; conditions: Condition[] };

/** A single condition: an optional comparison between two terms, or a bare value used as-is. */
export interface Condition {
  id: string;
  negate: boolean;
  left: TermNode;
  op: ComparisonOp | null;
  right: TermNode;
}

export function emptyTerm(): TermNode {
  return { kind: "literal", valueType: "string", value: "" };
}

export function emptyNumberTerm(): TermNode {
  return { kind: "literal", valueType: "number", value: "" };
}

export function emptyCondition(): Condition {
  return {
    id: nextId("cond"),
    negate: false,
    left: emptyTerm(),
    op: null,
    right: emptyTerm(),
  };
}

/** Starting args for a new step. Whatever the control shows must be stored too, or the UI and
 * the rendered expression disagree (e.g. a required stream arg needs a real chain, not unset). */
export function defaultStepArgs(fnId: string): Record<string, ArgValue> {
  const args: Record<string, ArgValue> = {};
  const streamSource = CONSTANTS.find((c) => c.type === "streams");
  for (const spec of getFunction(fnId).args) {
    if (spec.defaultValue !== undefined && !spec.variadic) {
      args[spec.name] = { kind: "scalar", value: spec.defaultValue };
      continue;
    }
    // Variadic stream slots stay empty; they render as an explicit "add" list.
    if (spec.type !== "streams" || !spec.required || spec.variadic || !streamSource) continue;
    args[spec.name] = { kind: "chain", chain: emptyChain(streamSource.id) };
  }
  return args;
}

/** Removes one step, keeping the rest when the types still line up. Only a type-changing step
 * (count, values()) can strand what follows, and only then is the remainder discarded too. */
export function removeStepAt(chain: Chain, index: number): Chain {
  const kept = chain.steps.filter((_, i) => i !== index);
  let type: SelValueType = CONSTANTS.find((c) => c.id === chain.sourceId)?.type ?? "streams";
  for (const step of kept) {
    const fn = getFunction(step.fnId);
    if (fn.pipeType !== type) return { ...chain, steps: chain.steps.slice(0, index) };
    type = fn.returns;
  }
  return { ...chain, steps: kept };
}

/** True when removing this function would strand the ones after it, so they go too. */
export function removalCascades(chain: Chain, index: number): boolean {
  return removeStepAt(chain, index).steps.length !== chain.steps.length - 1;
}

/** The same chain with count() appended - the one step that turns a stream list into a number. */
export function countedChain(chain: Chain): Chain {
  return { ...chain, steps: [...chain.steps, { id: nextId("step"), fnId: "count", args: {} }] };
}

/** A condition seeded with a live value, so a fresh one never reports as always-true/always-false. */
export function liveCondition(defaultSource: string = CONSTANTS[0].id): Condition {
  const cond = emptyCondition();
  cond.left = { kind: "chain", chain: emptyChain(defaultSource) };
  return cond;
}

/** A group opens with two conditions: one condition needs no parentheses, and the parser folds a
 * single-condition group back to the bare condition anyway. */
export function emptyGroup(): TermNode {
  return { kind: "group", joiner: "or", conditions: [liveCondition(), liveCondition()] };
}

/** The SEL type a term evaluates to. A ternary is assumed to match on both branches; its own
 * type is taken from `then`. */
export function termOutputType(term: TermNode): SelValueType {
  switch (term.kind) {
    case "chain":
      return chainOutputType(term.chain);
    case "literal":
      return term.valueType;
    case "arithmetic":
      return "number";
    case "ternary":
      return termOutputType(term.then);
    case "group":
      return "boolean";
  }
}

/** True when a term reads nothing from the request - a constant fold like `1 + 1`. Only a
 * chain is live. */
export function isStaticTerm(term: TermNode): boolean {
  switch (term.kind) {
    case "chain":
      return false;
    case "literal":
      return true;
    case "arithmetic":
      return isStaticTerm(term.left) && isStaticTerm(term.right);
    case "ternary":
      return isStaticCondition(term.condition) && isStaticTerm(term.then) && isStaticTerm(term.else);
    case "group":
      return term.conditions.every(isStaticCondition);
  }
}

/** True when the condition always evaluates to the same answer, whatever the addons return. */
export function isStaticCondition(cond: Condition): boolean {
  if (!isStaticTerm(cond.left)) return false;
  return cond.op === null || isStaticTerm(cond.right);
}

/** Constants that can fill a slot restricted to `types`, either directly or after being wrapped
 * in functions (totalStreams qualifies for a number slot because count() gets it there). */
export function constantsProducing(types: SelValueType[]): SelConstant[] {
  return CONSTANTS.filter((c) => {
    const reachable = reachableTypes(c.type);
    return types.some((t) => reachable.has(t));
  });
}

/** A number term that actually reads from the request, used to seed a new calculation so the
 * default state is never a pointless constant fold. */
export function liveNumberTerm(): TermNode {
  const constant = CONSTANTS.find((c) => c.type === "number") ?? CONSTANTS[0];
  return { kind: "chain", chain: emptyChain(constant.id) };
}

/** The comparison operators that make sense against a term of this type. Streams and array
 * types return none: they aren't directly comparable (wrap in count() etc. to reach a number, or
 * use as a bare value). */
export function comparisonOpsForType(type: SelValueType): ComparisonOp[] {
  switch (type) {
    case "number":
      return ["==", "!=", ">", "<", ">=", "<="];
    case "string":
      return ["==", "!=", "in"];
    case "boolean":
      return ["==", "!="];
    case "stringArray":
      // The list itself can't be compared, but asking whether it contains something can.
      return ["includes"];
    default:
      return [];
  }
}

/** What the *other* side of a comparison must resolve to, given the operator and the known
 * side's type. `in` is asymmetric: the tested value is a scalar, the sequence is a string array. */
export function requiredTypesFor(op: ComparisonOp, knownType: SelValueType): SelValueType[] {
  if (op === "in") return ["stringArray"];
  if (op === "includes") return ["string"];
  return [knownType];
}

/** A safe default term matching a type restriction: the first matching constant, or an empty
 * literal when the restriction allows a literal-representable type. */
export function defaultTermForTypes(types: SelValueType[]): TermNode {
  const literalType = (["string", "number", "boolean"] as const).find((t) => types.includes(t));
  if (literalType) return { kind: "literal", valueType: literalType, value: "" };
  const constant = CONSTANTS.find((c) => types.includes(c.type));
  if (constant) return { kind: "chain", chain: emptyChain(constant.id) };
  return emptyTerm();
}

export interface BuilderState {
  joiner: "and" | "or";
  conditions: Condition[];
  name: string;
}

/** Opens empty - a pre-filled condition read as a suggestion nobody asked for. */
export function initialBuilderState(): BuilderState {
  return {
    joiner: "and",
    conditions: [],
    name: "",
  };
}

/** The constant a fresh chain starts from. */
export function defaultSource(): string {
  return CONSTANTS[0].id;
}
