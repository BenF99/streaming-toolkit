import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseExpression } from "../lib/exit-condition/parse";

/**
 * The builder's model is a deliberate subset of SEL. Anything outside it is refused with a reason,
 * never approximated: silently dropping a clause would hand back an expression that isn't the one
 * that was pasted, which is worse than saying no.
 */
describe("input outside the model is refused, with a reason", () => {
  const REFUSALS: [string, RegExp][] = [
    ["count(totalStreams) >= 2 and count(cached(totalStreams)) > 1 or totalTimeTaken > 5", /Mixes/],
    ["bogus(totalStreams) >= 1", /bogus/],
    ["notAConstant > 5", /notAConstant/],
    // pin() is a real SEL function, but it has no effect in an exit condition, so the catalog
    // excludes it and the parser must not invent it.
    ["count(pin(totalStreams)) >= 1", /pin/],
    ["count(totalStreams) >=", /ends early/i],
    ["count(totalStreams) >= 5 trailing", /left over/i],
    ["count(totalStreams", /\)|ends early/i],
    ["regexMatched(totalStreams, 'unclosed", /never closed/i],
    ["/* unclosed name count(totalStreams) >= 1", /never closed/i],
  ];

  for (const [input, pattern] of REFUSALS) {
    it(`refuses: ${input.slice(0, 50)}`, () => {
      const parsed = parseExpression(input);
      assert.equal(parsed.ok, false, `expected a refusal for ${input}`);
      if (!parsed.ok) assert.match(parsed.error, pattern);
    });
  }
});

describe("a refusal never mangles the message", () => {
  it("names the joiner problem in full", () => {
    const parsed = parseExpression("count(totalStreams) >= 2 and totalTimeTaken > 1 or queryType == 'movie'");
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.ok(parsed.error.length > 20, "an error should explain, not just fail");
  });
});
