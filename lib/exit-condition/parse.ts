import { CONSTANTS, FUNCTIONS, getFunction, type ComparisonOp, type SelArgSpec } from "./catalog";
import { chainOutputType, emptyChain, nextId, type ArgValue, type BuilderState, type Chain, type ChainStep, type Condition, type TermNode } from "./model";

export type ParseResult = { ok: true; state: BuilderState } | { ok: false; error: string };

/** Spellings the AIOStreams parser accepts for the same function. */
const ALIASES: Record<string, string> = {
  subtitles: "subtitle",
  keywords: "keyword",
  seScore: "streamExpressionScore",
  mean: "avg",
  q2: "median",
};

function resolveFunctionId(name: string): string | null {
  const id = ALIASES[name] ?? name;
  return FUNCTIONS.some((f) => f.id === id) ? id : null;
}

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

type TokenType = "ident" | "number" | "string" | "op" | "punc";
interface Token {
  type: TokenType;
  value: string;
  at: number;
}

const OPERATORS = ["==", "!=", ">=", "<=", ">", "<", "+", "-", "*", "/"];
const PUNCTUATION = ["(", ")", ",", "?", ":"];

class ParseError extends Error {}

function fail(message: string): never {
  throw new ParseError(message);
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    // Block comments carry the expression's name; handled before tokenizing, skipped here.
    if (ch === "/" && input[i + 1] === "*") {
      const end = input.indexOf("*/", i + 2);
      if (end === -1) fail("A /* comment is never closed.");
      i = end + 2;
      continue;
    }

    if (ch === "'" || ch === '"') {
      const quote = ch;
      let value = "";
      i += 1;
      while (i < input.length && input[i] !== quote) {
        if (input[i] === "\\") {
          value += input[i + 1] ?? "";
          i += 2;
          continue;
        }
        value += input[i];
        i += 1;
      }
      if (i >= input.length) fail("A quoted value is never closed.");
      i += 1;
      tokens.push({ type: "string", value, at: i });
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(input[i + 1] ?? ""))) {
      let value = "";
      while (i < input.length && /[0-9.]/.test(input[i])) {
        value += input[i];
        i += 1;
      }
      tokens.push({ type: "number", value, at: i });
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let value = "";
      while (i < input.length && /[A-Za-z0-9_]/.test(input[i])) {
        value += input[i];
        i += 1;
      }
      tokens.push({ type: "ident", value, at: i });
      continue;
    }

    const twoChar = input.slice(i, i + 2);
    if (OPERATORS.includes(twoChar)) {
      tokens.push({ type: "op", value: twoChar, at: i });
      i += 2;
      continue;
    }
    if (OPERATORS.includes(ch)) {
      tokens.push({ type: "op", value: ch, at: i });
      i += 1;
      continue;
    }
    if (PUNCTUATION.includes(ch)) {
      tokens.push({ type: "punc", value: ch, at: i });
      i += 1;
      continue;
    }

    fail(`Don't recognise “${ch}”.`);
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Call tree
// ---------------------------------------------------------------------------

/** A bare identifier or a function call, before it is folded into a Chain. */
type CallNode = { kind: "ident"; name: string } | { kind: "call"; name: string; args: ValueNode[] };
type ValueNode = CallNode | { kind: "literal"; valueType: "number" | "string" | "boolean"; value: string } | { kind: "term"; term: TermNode };

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.pos + offset];
  }

  private at(value: string): boolean {
    return this.peek()?.value === value;
  }

  private eat(value: string): boolean {
    if (this.at(value)) {
      this.pos += 1;
      return true;
    }
    return false;
  }

  private expect(value: string): void {
    if (!this.eat(value)) fail(`Expected “${value}”.`);
  }

  private save(): number {
    return this.pos;
  }

  private restore(mark: number): void {
    this.pos = mark;
  }

  get done(): boolean {
    return this.pos >= this.tokens.length;
  }

  // --- Expression ---------------------------------------------------------

  /** The model holds one joiner per expression, so mixed `and`/`or` is refused rather than
   * silently flattened. */
  parseExpression(): { joiner: "and" | "or"; conditions: Condition[] } {
    const conditions = [this.parseCondition()];
    let joiner: "and" | "or" | null = null;

    while (!this.done && (this.at("and") || this.at("or"))) {
      const word = this.peek()!.value as "and" | "or";
      if (joiner && joiner !== word) {
        fail("Mixes “and” with “or”. This builder holds one or the other for the whole expression.");
      }
      joiner = word;
      this.pos += 1;
      conditions.push(this.parseCondition());
    }

    return { joiner: joiner ?? "and", conditions };
  }

  parseCondition(): Condition {
    if (this.at("not")) {
      this.pos += 1;
      this.expect("(");
      const inner = this.parseCondition();
      this.expect(")");
      return { ...inner, negate: true };
    }

    // A leading "(" is ambiguous: a grouped condition, a ternary, or a parenthesised value. Try
    // the grouping first and rewind if the closing paren isn't where a group would put it.
    if (this.at("(")) {
      const mark = this.save();
      this.pos += 1;
      try {
        const inner = this.parseCondition();
        if (this.eat(")")) return inner;
      } catch {
        // fall through to the value reading
      }
      this.restore(mark);
    }

    const left = this.parseTerm();
    const op = this.peekComparison();
    if (!op) return { id: nextId("cond"), negate: false, left, op: null, right: { kind: "literal", valueType: "string", value: "" } };

    this.pos += 1;
    const right = this.parseTerm();

    // `X in list` is stored as the list, so the builder shows the list as the subject.
    if (op === "in" && left.kind === "literal" && right.kind === "chain" && chainOutputType(right.chain) === "stringArray") {
      return { id: nextId("cond"), negate: false, left: right, op: "includes", right: left };
    }

    return { id: nextId("cond"), negate: false, left, op, right };
  }

  private peekComparison(): ComparisonOp | null {
    const token = this.peek();
    if (!token) return null;
    if (token.type === "op" && ["==", "!=", ">=", "<=", ">", "<"].includes(token.value)) return token.value as ComparisonOp;
    if (token.type === "ident" && token.value === "in") return "in";
    return null;
  }

  // --- Terms --------------------------------------------------------------

  parseTerm(): TermNode {
    let left = this.parsePrimary();
    // Left-associative, matching how the renderer writes it back out.
    while (!this.done && this.peek()!.type === "op" && ["+", "-", "*", "/"].includes(this.peek()!.value)) {
      const op = this.peek()!.value as "+" | "-" | "*" | "/";
      this.pos += 1;
      const right = this.parsePrimary();
      left = { kind: "arithmetic", op, left, right };
    }
    return left;
  }

  private parsePrimary(): TermNode {
    const token = this.peek();
    if (!token) fail("The expression ends early.");

    if (token.type === "number") {
      this.pos += 1;
      return { kind: "literal", valueType: "number", value: token.value };
    }
    if (token.type === "string") {
      this.pos += 1;
      return { kind: "literal", valueType: "string", value: token.value };
    }
    if (token.type === "ident" && (token.value === "true" || token.value === "false")) {
      this.pos += 1;
      return { kind: "literal", valueType: "boolean", value: token.value };
    }

    if (token.value === "(") {
      this.pos += 1;
      // Either a ternary, a group of conditions, or a parenthesised value.
      const mark = this.save();
      try {
        const condition = this.parseCondition();
        if (this.eat("?")) {
          const then = this.parseTerm();
          this.expect(":");
          const otherwise = this.parseTerm();
          this.expect(")");
          return { kind: "ternary", condition, then, else: otherwise };
        }
      } catch {
        // not a ternary
      }
      this.restore(mark);
      const { joiner, conditions } = this.parseExpression();
      this.expect(")");
      // One bare condition in parentheses is just a parenthesised value; only a joined or
      // inverted set needs a group to hold it.
      const only = conditions.length === 1 ? conditions[0] : null;
      if (only && only.op === null && !only.negate) return only.left;
      return { kind: "group", joiner, conditions };
    }

    if (token.type === "ident") {
      const node = this.parseCall();
      return { kind: "chain", chain: foldChain(node) };
    }

    fail(`Don't recognise “${token.value}”.`);
  }

  /** An identifier, or a function call with its arguments. */
  private parseCall(): CallNode {
    const token = this.peek();
    if (!token || token.type !== "ident") fail("Expected a name.");
    this.pos += 1;
    const name = token.value;

    if (!this.at("(")) return { kind: "ident", name };

    this.pos += 1;
    const args: ValueNode[] = [];
    if (!this.at(")")) {
      do {
        args.push(this.parseArgument());
      } while (this.eat(","));
    }
    this.expect(")");
    return { kind: "call", name, args };
  }

  private parseArgument(): ValueNode {
    const token = this.peek();
    if (token && token.type === "ident" && token.value !== "true" && token.value !== "false") {
      return this.parseCall();
    }
    const term = this.parseTerm();
    if (term.kind === "literal") return { kind: "literal", valueType: term.valueType, value: term.value };
    return { kind: "term", term };
  }
}

// ---------------------------------------------------------------------------
// Call tree -> Chain
// ---------------------------------------------------------------------------

/** Nested calls -> flat chain. SEL writes the last step outermost, so this recurses to the
 * constant at the centre and unwinds. `pipedArgIndex` says which arg is the piped value. */
function foldChain(node: CallNode): Chain {
  if (node.kind === "ident") {
    const constant = CONSTANTS.find((c) => c.id === node.name);
    if (!constant) fail(`“${node.name}” isn't one of the values available here.`);
    return emptyChain(constant.id);
  }

  const fnId = resolveFunctionId(node.name);
  if (!fnId) fail(`“${node.name}” isn't a function this builder knows.`);
  const fn = getFunction(fnId);

  const pipedIndex = fn.pipedArgIndex ?? 0;
  const piped = node.args[pipedIndex];
  if (!piped) fail(`${fn.label}() is missing the list it works on.`);
  if (piped.kind === "literal" || piped.kind === "term") fail(`${fn.label}() needs a list of streams, not a fixed value.`);

  const chain = foldChain(piped);
  const rest = node.args.filter((_, i) => i !== pipedIndex);
  const step: ChainStep = { id: nextId("step"), fnId, args: mapArguments(fn.args, rest, fn.label) };
  return { ...chain, steps: [...chain.steps, step] };
}

/** Positional arguments onto the function's named slots, with the variadic slot taking the rest. */
function mapArguments(specs: SelArgSpec[], values: ValueNode[], fnLabel: string): Record<string, ArgValue> {
  const args: Record<string, ArgValue> = {};
  let index = 0;

  for (const spec of specs) {
    if (index >= values.length) break;

    if (spec.variadic) {
      const rest = values.slice(index);
      index = values.length;
      if (spec.type === "streams") {
        args[spec.name] = { kind: "chainList", chains: rest.map((v) => asChain(v, fnLabel)) };
      } else {
        args[spec.name] = { kind: "list", values: rest.map((v) => asScalar(v, fnLabel)) };
      }
      continue;
    }

    const value = values[index];
    index += 1;
    args[spec.name] = spec.type === "streams" ? { kind: "chain", chain: asChain(value, fnLabel) } : { kind: "scalar", value: asScalar(value, fnLabel) };
  }

  if (index < values.length) fail(`${fnLabel}() was given more values than it takes.`);
  return args;
}

function asChain(value: ValueNode, fnLabel: string): Chain {
  if (value.kind === "literal" || value.kind === "term") fail(`${fnLabel}() needs a list of streams here.`);
  return foldChain(value);
}

function asScalar(value: ValueNode, fnLabel: string): string {
  if (value.kind === "literal") return value.value;
  if (value.kind === "ident") return value.name;
  fail(`${fnLabel}() needs a plain value here.`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Pull the leading `/* name *​/` the renderer writes, if present. */
function takeName(input: string): { name: string; rest: string } {
  const match = input.match(/^\s*\/\*([\s\S]*?)\*\//);
  if (!match) return { name: "", rest: input };
  return { name: match[1].trim(), rest: input.slice(match[0].length) };
}

export function parseExpression(input: string): ParseResult {
  const trimmed = input.trim();
  // An empty box reads as an empty builder, not a refusal - clearing the text should clear the state.
  if (trimmed === "") return { ok: true, state: { joiner: "and", conditions: [], name: "" } };

  try {
    const { name, rest } = takeName(trimmed);
    if (rest.trim() === "") return { ok: true, state: { joiner: "and", conditions: [], name } };
    const parser = new Parser(tokenize(rest));
    const { joiner, conditions } = parser.parseExpression();
    if (!parser.done) fail("There's something left over at the end.");
    if (conditions.length === 0) fail("No conditions found.");
    return { ok: true, state: { joiner, conditions, name } };
  } catch (error) {
    if (error instanceof ParseError) return { ok: false, error: error.message };
    return { ok: false, error: "Couldn't read that as a stream expression." };
  }
}
