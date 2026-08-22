import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stateProblem, isStateComplete } from "../lib/exit-condition/validity";
import { stepArgSummary, renderChain } from "../lib/exit-condition/render";
import { parseExpression } from "../lib/exit-condition/parse";
import { removalCascades, removeStepAt } from "../lib/exit-condition/model";

function problemFor(expression: string) {
  const parsed = parseExpression(expression);
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
  return stateProblem(parsed.state);
}

function chainOf(expression: string) {
  const parsed = parseExpression(expression);
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
  const term = parsed.state.conditions[0].left;
  assert.equal(term.kind, "chain");
  return term.kind === "chain" ? term.chain : undefined!;
}

/**
 * Expressions the AIOStreams parser accepts and evaluates without complaint, but which can only
 * ever produce one answer. They are syntactically fine and semantically pointless, which is
 * precisely the class of mistake this tool exists to catch - no syntax checker would flag them.
 */
describe("expressions that are valid but can never do anything", () => {
  it("catches excluding a list from itself", () => {
    const problem = problemFor("count(negate(totalStreams, totalStreams)) >= 1");
    assert.ok(problem, "negate(X, X) is always empty");
    assert.match(problem.summary, /always leaves nothing/);
  });

  it("catches merging a list with itself", () => {
    const problem = problemFor("count(merge(totalStreams, totalStreams)) >= 1");
    assert.ok(problem, "merge(X, X) changes nothing");
  });

  it("catches a count compared against zero", () => {
    // >= 0 looks like a real threshold and is the operator the builder reaches for first.
    const problem = problemFor("count(totalStreams) >= 0");
    assert.ok(problem, "a count can never be negative");
    assert.match(problem.summary, /never be negative/);
  });

  it("allows the comparison people actually mean by it", () => {
    assert.equal(problemFor("count(totalStreams) > 0"), null);
  });

  it("catches a min above its own max", () => {
    const problem = problemFor("count(seeders(totalStreams, 500, 10)) >= 1");
    assert.ok(problem, "nothing can fall inside an inverted range");
  });

  it("leaves ordinary expressions alone", () => {
    assert.equal(problemFor("count(cached(totalStreams)) >= 5"), null);
    assert.equal(problemFor("(count(cached(totalStreams)) >= 5) or (totalTimeTaken > 3000)"), null);
  });
});

describe("completeness", () => {
  it("treats a filled expression as complete", () => {
    const parsed = parseExpression("count(cached(totalStreams)) >= 5");
    assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
    assert.equal(isStateComplete(parsed.state), true);
  });

  it("treats an empty builder as incomplete", () => {
    const parsed = parseExpression("");
    assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
    assert.equal(isStateComplete(parsed.state), false);
  });
});

/**
 * Removing a function keeps the ones after it wherever the types still line up. Slicing
 * unconditionally was safe but blunt: deleting one filter silently took every function after it.
 */
describe("removing a function from a chain", () => {
  it("keeps what follows when the types still line up", () => {
    const chain = chainOf("count(resolution(cached(totalStreams), '2160p'))");
    assert.equal(removalCascades(chain, 0), false);
    assert.equal(renderChain(removeStepAt(chain, 0)), "count(resolution(totalStreams, '2160p'))");
  });

  it("takes the rest with it when they depend on what it produced", () => {
    const chain = chainOf("avg(values(cached(totalStreams), 'bitrate'))");
    assert.equal(removalCascades(chain, 1), true, "avg needs the numbers values() produced");
    assert.equal(renderChain(removeStepAt(chain, 1)), "cached(totalStreams)");
  });
});

describe("collapsed function rows still say what they are set to", () => {
  it("summarises a list argument", () => {
    const chain = chainOf("count(resolution(totalStreams, '2160p', '1440p'))");
    assert.equal(stepArgSummary(chain.steps[0]), "2160p, 1440p");
  });

  it("summarises a numeric pair", () => {
    const chain = chainOf("count(seeders(totalStreams, 10, 500))");
    assert.equal(stepArgSummary(chain.steps[0]), "10, 500");
  });

  it("is empty for a function that takes no arguments", () => {
    const chain = chainOf("count(cached(totalStreams))");
    assert.equal(stepArgSummary(chain.steps[0]), "");
  });
});

/**
 * The renderer escapes values on the way into SEL string literals. A release group with an
 * apostrophe in it is ordinary user input, and must not produce a broken expression.
 */
describe("string escaping", () => {
  it("survives an apostrophe", () => {
    const parsed = parseExpression("count(releaseGroup(totalStreams, 'O\\'Brien')) >= 1");
    assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
    const chain = chainOf("count(releaseGroup(totalStreams, 'O\\'Brien')) >= 1");
    assert.equal(renderChain(chain), "count(releaseGroup(totalStreams, 'O\\'Brien'))");
  });
});
