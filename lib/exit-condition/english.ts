// Renders the condition tree as English. Same tree render.ts walks, so it can't drift from the
// expression. Falls back to a raw SEL fragment where it can't phrase something.

import { CONSTANTS, getFunction, type ComparisonOp } from "./catalog";
import { PLAIN_CONSTANTS, plainFunction } from "./plain";
import { renderChain } from "./render";
import { needsComparison } from "./validity";
import { chainOutputType, termOutputType, type ArgValue, type BuilderState, type Chain, type Condition, type TermNode } from "./model";

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

function joinOr(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} or ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, or ${values[values.length - 1]}`;
}

function joinAnd(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

/** ms -> a readable "N seconds"/"N minutes". */
function humanMilliseconds(ms: number): string {
  if (ms >= 60000 && ms % 60000 === 0) {
    const minutes = ms / 60000;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  if (ms >= 1000) {
    const seconds = Math.round(ms / 100) / 10;
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }
  return `${ms}ms`;
}

const NUMBER_FORMAT = new Intl.NumberFormat("en-US");

function formatNumber(raw: string): string {
  const n = Number(raw);
  return Number.isNaN(n) ? raw : NUMBER_FORMAT.format(n);
}

/** Typed text is quoted; fixed options read as bare words. `sameSourceAs` renders a
 * same-source nested list as "those" instead of repeating the subject. */
function plainArg(value: ArgValue | undefined, quote: boolean, sameSourceAs?: string): string | null {
  if (!value) return null;
  const wrap = (v: string) => (quote ? `“${v}”` : v);
  if (value.kind === "scalar") return value.value.trim() === "" ? null : wrap(value.value);
  if (value.kind === "list") {
    const vals = value.values.filter((v) => v.trim() !== "");
    return vals.length ? joinOr(vals.map(wrap)) : null;
  }
  if (value.kind === "chain") return nounPhrase(value.chain, sameSourceAs);
  if (value.kind === "chainList") {
    const parts = value.chains.map((c) => nounPhrase(c, sameSourceAs)).filter(Boolean);
    return parts.length ? joinAnd(parts) : null;
  }
  return null;
}

const CLAUSE_LEADS = ["that are ", "that aren't ", "that matched ", "with ", "from ", "in ", "whose ", "encoded as ", "subtitled in ", "on "];

function collapseClauses(clauses: string[]): string[] {
  const out: string[] = [];
  for (const clause of clauses) {
    const lead = CLAUSE_LEADS.find((l) => clause.startsWith(l));
    const previous = out[out.length - 1];
    const isList = (text: string) => text.includes(",") || text.includes(" or ");
    if (lead && previous && previous.startsWith(lead) && !isList(previous) && !isList(clause)) {
      out[out.length - 1] = `${previous} and ${clause.slice(lead.length)}`;
      continue;
    }
    out.push(clause);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Chains
// ---------------------------------------------------------------------------

// A chain read as a noun phrase. Narrowing steps append a clause ("... that are cached");
// reducing steps wrap the phrase ("the number of ..."), since English says the reduction first.
interface Phrase {
  text: string;
  /** Whether "the" belongs in front. */
  article: boolean;
}

interface PhraseOptions {
  /** Source id of the surrounding chain, for a nested chain from the same source. */
  sameSourceAs?: string;
  /** Say the source as a bare plural ("streams") when a quantifier precedes it. */
  counting?: boolean;
}

function buildPhrase(chain: Chain, options: PhraseOptions = {}): Phrase {
  const constant = CONSTANTS.find((c) => c.id === chain.sourceId);
  const plainConstant = PLAIN_CONSTANTS[chain.sourceId];
  const nested = options.sameSourceAs === chain.sourceId;
  const named = (options.counting && plainConstant?.countNoun) || plainConstant?.noun || constant?.label || chain.sourceId;
  let text = nested ? "those" : named;
  let article = nested || options.counting ? false : plainConstant?.article ?? false;
  const clauses: string[] = [];

  function settle() {
    if (clauses.length === 0) return;
    text = `${text} ${joinAnd(collapseClauses(clauses))}`;
    clauses.length = 0;
  }

  for (let i = 0; i < chain.steps.length; i++) {
    const step = chain.steps[i];
    const fn = getFunction(step.fnId);
    const plain = plainFunction(step.fnId);
    const inputType = chainOutputType(chain, i);

    // A reduction over values(): one phrase, "the average bitrate of ...". Attribute was
    // parked by the preceding values() step.
    if (inputType === "numberArray" && plain?.word) {
      const word = fillPlaceholders(step, plain.word, undefined, chain.sourceId);
      const attribute = clauses.pop() ?? "";
      settle();
      text = attribute ? `${word} ${attribute} of ${text}` : `${word} of ${text}`;
      article = true;
      continue;
    }

    if (step.fnId === "count") {
      // Spend values()'s parked attribute here if count follows it directly, or it settles
      // as a stray adjective ("streams found so far bitrate").
      const parked = chain.steps[i - 1]?.fnId === "values" ? clauses.pop() : undefined;
      settle();
      text = parked ? `number of ${parked} values across ${text}` : `number of ${text}`;
      article = true;
      continue;
    }

    if (step.fnId === "values") {
      // Parked for the reduction that follows.
      clauses.push(plainArg(step.args["attribute"], false) ?? "value");
      continue;
    }

    if (!plain?.phrase) {
      settle();
      text = `${fn.label} of ${text}`;
      article = true;
      continue;
    }

    const filled = fillPlaceholders(step, plain.phrase, plain.bare, chain.sourceId);
    if (filled) clauses.push(filled);
  }

  settle();
  return { text, article };
}

/** A chain in subject position, with its article. */
export function nounPhrase(chain: Chain, sameSourceAs?: string): string {
  const phrase = buildPhrase(chain, { sameSourceAs });
  return phrase.article ? `the ${phrase.text}` : phrase.text;
}

/** Fills `{argName}` placeholders. Falls back to `bare` when every one is empty; leaves an
 * ellipsis for a single unfilled one. */
function fillPlaceholders(step: { fnId: string; args: Record<string, ArgValue> }, template: string, bare?: string, sameSourceAs?: string): string {
  const names = [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const specs = getFunction(step.fnId).args;
  const filled = names.map((name) => {
    const spec = specs.find((s) => s.name === name);
    const quote = spec?.type === "string" && (!spec.options || spec.options.length === 0);
    return plainArg(step.args[name], quote, sameSourceAs);
  });
  if (names.length > 0 && filled.every((v) => v === null)) return bare ?? "";
  let out = template;
  names.forEach((name, i) => {
    out = out.replace(`{${name}}`, filled[i] ?? "…");
  });
  return out;
}

// ---------------------------------------------------------------------------
// Terms and conditions
// ---------------------------------------------------------------------------

const COMPARISON_PHRASE: Record<ComparisonOp, string> = {
  "==": "is",
  "!=": "isn't",
  ">": "is more than",
  "<": "is less than",
  ">=": "is at least",
  "<=": "is at most",
  in: "is one of",
  includes: "includes",
};

// count(...) >= n reads as a quantity ("there are at least 2 streams that ...") so the
// threshold arrives before a long filter chain. `!=` omitted: "not exactly 3" reads worse plain.
const COUNT_QUANTIFIER: Partial<Record<ComparisonOp, string>> = {
  ">=": "at least",
  ">": "more than",
  "<=": "at most",
  "<": "fewer than",
  "==": "exactly",
};

const ARITHMETIC_PHRASE = { "+": "plus", "-": "minus", "*": "times", "/": "divided by" } as const;

/** True for the elapsed-time constant, whose numbers are milliseconds. */
function isElapsedTime(term: TermNode): boolean {
  return term.kind === "chain" && term.chain.sourceId === "totalTimeTaken" && term.chain.steps.length === 0;
}

function termPhrase(term: TermNode, asMilliseconds = false): string {
  switch (term.kind) {
    case "chain":
      return nounPhrase(term.chain);
    case "literal": {
      if (term.value.trim() === "") return "…";
      if (term.valueType === "number") {
        const n = Number(term.value);
        if (asMilliseconds && !Number.isNaN(n)) return humanMilliseconds(n);
        return formatNumber(term.value);
      }
      if (term.valueType === "boolean") return term.value === "true" ? "true" : "false";
      return `“${term.value}”`;
    }
    case "arithmetic":
      return `${termPhrase(term.left)} ${ARITHMETIC_PHRASE[term.op]} ${termPhrase(term.right)}`;
    case "ternary":
      return `${termPhrase(term.then)} if ${conditionPhrase(term.condition)}, otherwise ${termPhrase(term.else)}`;
  }
}

/** The quantity reading of `count(...) >= n`, or null when this condition isn't one. */
function quantityPhrase(cond: Condition): string | null {
  if (!cond.op) return null;
  const quantifier = COUNT_QUANTIFIER[cond.op];
  if (!quantifier) return null;
  if (cond.left.kind !== "chain") return null;
  const steps = cond.left.chain.steps;
  if (steps[steps.length - 1]?.fnId !== "count") return null;
  if (cond.right.kind !== "literal" || cond.right.valueType !== "number" || cond.right.value.trim() === "") return null;

  const listed = { ...cond.left.chain, steps: steps.slice(0, -1) };
  // count(values(...)) counts numbers, not streams - not a countable object here.
  if (chainOutputType(listed) !== "streams") return null;
  const { text } = buildPhrase(listed, { counting: true });
  return `there are ${quantifier} ${formatNumber(cond.right.value)} ${text}`;
}

export function conditionPhrase(cond: Condition): string {
  const left = termPhrase(cond.left);
  const quantity = quantityPhrase(cond);
  let body: string;

  if (quantity) {
    body = quantity;
  } else if (cond.op === "includes") {
    // Builder puts the list first (what you're asking about); SEL and English put the value
    // first, or it reads as a plural noun taking a singular verb.
    body = `${termPhrase(cond.right)} is one of ${left}`;
  } else if (cond.op) {
    const asMs = isElapsedTime(cond.left);
    body = `${left} ${COMPARISON_PHRASE[cond.op]} ${termPhrase(cond.right, asMs)}`;
  } else if (needsComparison(cond)) {
    // Still owes a comparison - leave it visibly unfinished rather than inventing a verb.
    body = `${left} is …`;
  } else if (cond.left.kind === "chain" && chainOutputType(cond.left.chain) === "streams") {
    body = `there are any ${bareStreamPhrase(cond.left)}`;
  } else if (termOutputType(cond.left) === "streams") {
    body = `${left} isn't empty`;
  } else if (termOutputType(cond.left) === "number") {
    body = `${left} isn't zero`;
  } else {
    body = `${left} is set`;
  }

  return cond.negate ? `it isn't the case that ${body}` : body;
}

function bareStreamPhrase(term: TermNode): string {
  if (term.kind !== "chain") return termPhrase(term);
  return buildPhrase(term.chain).text;
}

/** Avoids a trailing "….": an ellipsis already reads as unfinished. */
function terminate(sentence: string): string {
  return sentence.endsWith("…") ? sentence : `${sentence}.`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Several conditions render as separate clauses, not one "and"-joined sentence - each
 * clause already has its own "and"s, so joining more is ambiguous. */
export interface Readback {
  lead: string;
  clauses: string[];
}

export function expressionReadback(state: BuilderState): Readback | null {
  if (state.conditions.length === 0) return null;
  const parts = state.conditions.map(conditionPhrase);
  if (parts.length === 1) return { lead: terminate(`Stop searching once ${parts[0]}`), clauses: [] };
  const lead = state.joiner === "and" ? "Stop searching once all of these are true:" : "Stop searching once any of these are true:";
  return { lead, clauses: parts.map((p) => terminate(capitalise(p))) };
}

export { renderChain };
