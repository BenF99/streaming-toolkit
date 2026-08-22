import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderExpression } from "../lib/exit-condition/render";
import { parseExpression } from "../lib/exit-condition/parse";

const ROUND_TRIPS = [
  "totalStreams",
  "count(totalStreams) >= 5",
  "count(cached(totalStreams)) > 0",
  "totalTimeTaken > 5000",
  "'Torrentio' in queriedAddons",
  "not (count(totalStreams) >= 2)",
  "count(totalStreams) + 2 > 10",
  "avg(values(cached(totalStreams), 'bitrate')) > 5000",
  "count(seeders(age(cached(totalStreams), 0, 48), 10, 500)) >= 3",
  "count(negate(regexMatched(totalStreams, 'Bad'), totalStreams)) >= 1",
  "count(perGroup(totalStreams, 'quality', 3)) >= 2",
  "count(resolution(cached(totalStreams), '2160p', '1440p', '1080p')) >= 10",
  "(count(cached(totalStreams)) >= 5) or (totalTimeTaken > 3000)",
  "(count(cached(totalStreams)) >= 5) and (totalTimeTaken > 3000)",
  "(count(resolution(cached(negate(regexMatched(totalStreams, 'Bad'), regexMatched(totalStreams))), '2160p')) >= 2) or " +
    "(count(resolution(cached(negate(regexMatched(totalStreams, 'Bad'), regexMatched(totalStreams))), '2160p', '1440p', '1080p')) >= 5) or " +
    "(count(quality(resolution(cached(totalStreams), '2160p', '1440p', '1080p'), 'Bluray REMUX', 'Bluray', 'WEB-DL')) >= 10) or " +
    "(totalTimeTaken > 5000)",
];

describe("parse and render are inverses", () => {
  for (const expression of ROUND_TRIPS) {
    it(`is stable: ${expression.slice(0, 60)}`, () => {
      const parsed = parseExpression(expression);
      assert.ok(parsed.ok, `expected to parse, got: ${parsed.ok ? "" : parsed.error}`);
      assert.equal(renderExpression(parsed.state), expression);
    });
  }
});

describe("input normalises to one canonical spelling", () => {
  const SAME: [string, string][] = [
    ["count(totalStreams)>=5", "count(totalStreams) >= 5"],
    ['count(resolution(totalStreams,"2160p"))>=1', "count(resolution(totalStreams, '2160p')) >= 1"],
    ["not(count(totalStreams) >= 5)", "not (count(totalStreams) >= 5)"],
    ["  count( totalStreams )  >=  5  ", "count(totalStreams) >= 5"],
    // Aliases the AIOStreams parser accepts, folded onto their canonical names.
    ["count(subtitles(totalStreams, 'English')) >= 1", "count(subtitle(totalStreams, 'English')) >= 1"],
    ["mean(values(totalStreams, 'bitrate')) > 1", "avg(values(totalStreams, 'bitrate')) > 1"],
  ];
  for (const [input, expected] of SAME) {
    it(`${input.trim()} -> ${expected}`, () => {
      const parsed = parseExpression(input);
      assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
      assert.equal(renderExpression(parsed.state), expected);
    });
  }
});

describe("the expression name survives the trip", () => {
  it("keeps a /* name */ prefix", () => {
    const parsed = parseExpression("/* Good enough */ count(totalStreams) >= 5");
    assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
    assert.equal(parsed.state.name, "Good enough");
    assert.equal(renderExpression(parsed.state), "/* Good enough */ count(totalStreams) >= 5");
  });

  it("reads an empty box as an empty builder", () => {
    const parsed = parseExpression("   ");
    assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
    assert.deepEqual(parsed.state.conditions, []);
    assert.equal(renderExpression(parsed.state), "");
  });
});
