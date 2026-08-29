import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expressionReadback } from "../lib/exit-condition/english";
import { parseExpression } from "../lib/exit-condition/parse";
import { unphrasedFunctionIds } from "../lib/exit-condition/plain";

function readback(expression: string): string {
  const parsed = parseExpression(expression);
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
  const result = expressionReadback(parsed.state);
  assert.ok(result, "expected a readback");
  return [result.lead, ...result.clauses].join(" ");
}


describe("plain-English readback", () => {
  it("says a count as a quantity, so the threshold arrives before the filters", () => {
    assert.equal(readback("count(cached(totalStreams)) >= 5"), "Stop searching once there are at least 5 streams that are cached.");
  });

  it("calls a nested list from the same source 'those', instead of repeating the subject", () => {
    assert.equal(
      readback("count(negate(regexMatched(totalStreams, 'Bad'), totalStreams)) >= 1"),
      "Stop searching once there are at least 1 streams excluding those that matched the regex filter “Bad”.",
    );
  });

  it("does not fold two comma-bearing clauses into one ambiguous phrase", () => {
    const sentence = readback("count(quality(resolution(cached(totalStreams), '2160p', '1440p'), 'Bluray')) >= 10");
    assert.match(sentence, /that are cached, that are 2160p or 1440p, and that are Bluray/);
  });

  it("reads milliseconds as seconds", () => {
    assert.equal(readback("totalTimeTaken > 5000"), "Stop searching once the time spent searching is more than 5 seconds.");
  });

  it("collapses values() into the aggregate that follows it", () => {
    assert.equal(
      readback("avg(values(cached(totalStreams), 'bitrate')) > 5000"),
      "Stop searching once the average bitrate of streams found so far that are cached is more than 5,000.",
    );
  });

  it("counts values without turning the attribute into an adjective", () => {
    // Regression: this once read "there are more than 0 streams bitrate".
    assert.equal(
      readback("count(values(totalStreams, 'bitrate')) > 0"),
      "Stop searching once the number of bitrate values across streams found so far is more than 0.",
    );
  });

  it("puts the tested value first for `in`, matching English and SEL word order", () => {
    // Regression: read as "the addons that have answered includes X", a plural noun with a
    // singular verb.
    assert.equal(readback("'Torrentio' in queriedAddons"), "Stop searching once “Torrentio” is one of the addons that have answered.");
  });

  it("spells out an inverted condition", () => {
    assert.equal(readback("not (count(totalStreams) >= 2)"), "Stop searching once it isn't the case that there are at least 2 streams.");
  });

  it("lists several conditions instead of running them into one sentence", () => {
    const parsed = parseExpression("(count(cached(totalStreams)) >= 5) or (totalTimeTaken > 3000)");
    assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
    const result = expressionReadback(parsed.state)!;
    assert.equal(result.lead, "Stop searching once any of these are true:");
    assert.deepEqual(result.clauses, [
      "There are at least 5 streams that are cached.",
      "The time spent searching is more than 3 seconds.",
    ]);
  });

  it("leads with the condition when a ternary picks between two sets of conditions", () => {
    assert.equal(
      readback("(queryType == 'movie' ? (count(totalStreams) >= 4 or totalTimeTaken > 1000) : (count(totalStreams) >= 2))"),
      "Stop searching once if what's being searched for is “movie”, there are at least 4 streams or the time spent searching is more than 1 second; " +
        "otherwise there are at least 2 streams.",
    );
  });

  it("joins a set of conditions with the word it was built from", () => {
    assert.match(
      readback("(queryType == 'movie' ? (count(totalStreams) >= 4 and totalTimeTaken > 1000) : (count(totalStreams) >= 2))"),
      /there are at least 4 streams and the time spent searching is more than 1 second/,
    );
  });

  it("has nothing to say about an empty builder", () => {
    const parsed = parseExpression("");
    assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
    assert.equal(expressionReadback(parsed.state), null);
  });
});

describe("plain-language coverage", () => {
  it("phrases every function in the catalog", () => {
    // A function with no entry still works, but drops out of the sentence as a raw SEL fragment.
    assert.deepEqual(unphrasedFunctionIds(), []);
  });
});
