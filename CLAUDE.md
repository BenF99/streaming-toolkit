# Streaming Toolkit

Visual builders for AIOStreams' config-time mini-languages. See [README.md](README.md) for what it does and why. This file is for anyone (human or agent) changing the code.

Each tool owns a `lib/<tool>/` and `components/<tool>/` pair. `components/ui/` and `components/layout/` are shared across tools - nothing tool-specific belongs there. What follows describes the Exit Condition Builder, the only tool so far; a second tool gets its own section here, not a rewrite of this one.

## Commands

```bash
npm run dev         # http://localhost:3000
npm test            # node:test, tests/*.test.ts
npm run typecheck
npm run lint
npm run build        # static export -> ./out
```

Run `typecheck`, `lint`, and `test` before calling anything done - CI (`.github/workflows/cicd.yml`) runs all three on every push and PR (skipped for release-please's own PR), and only deploys on push to `main` if they pass.

## Architecture

```
lib/exit-condition/
  catalog.ts   Every function, constant, operator, argument bound. Verified against the
               AIOStreams parser source (resources/AIOStreams/, gitignored, local-only),
               not its docs. This file is the ground truth.
  plain.ts     Menu labels, groupings, sentence fragments. Human phrasing, kept separate
               from catalog.ts so it's clear which file is asserting a parser fact vs a
               UX opinion.
  model.ts     The builder's tree (conditions, terms, chains) and its type rules.
  render.ts    tree -> SEL text.
  parse.ts     SEL text -> tree. The inverse of render.ts; must stay one.
  validity.ts  Whether a tree is finished, and whether it can ever do anything (the
               "valid SEL but pointless" checks: negate(X,X), count() >= 0, etc).
  english.ts   tree -> plain-English readback. Walks the same tree render.ts does -
               never a parallel model, or the sentence and the expression could disagree.
  diff.ts      Which characters changed between two renders, for the highlight animation.
components/exit-condition/   One component per concern (ChainBuilder, ConditionRow, TermBuilder, ...).
components/ui/                Shared primitives (buttons, chips, menus, icons) - no tool-specific logic.
components/layout/             App shell, tab bar, theme toggle.
tests/                        node:test. See "Testing" below before adding a function or a rule.
```

## Working rules

**catalog.ts is verified against source, not assumed.** Before adding or changing an entry, find the real behavior in `resources/AIOStreams/packages/core/src/parser/streamExpression.ts` (clone AIOStreams locally if that directory is empty - it's gitignored) and cite the line. Don't trust the AIOStreams docs alone; they've drifted from the parser before.

**Correct by construction, not validated after.** The UI should make an invalid expression impossible to build, not build it and then complain. If you're adding a `if (invalid) show error`, first ask whether the control that produced `invalid` should have offered it at all.

**render.ts and parse.ts are inverses.** Every new syntax shape needs a round-trip test (`tests/roundtrip.test.ts`) proving `parse(render(x)) === x`. If parsing accepts a shape rendering can't produce, or vice versa, that's a bug, not an edge case.

**english.ts reads the tree, never re-derives it.** If a sentence is wrong, the fix is almost always in how `english.ts` reads a node, not in adding a special case in `render.ts` or `model.ts`.

## Testing

- `tests/roundtrip.test.ts` - parse/render stability, including the real four-clause expression this tool was built against.
- `tests/parse-refusals.test.ts` - invalid input is refused with a specific reason, never silently mangled.
- `tests/english.test.ts` - the readback says what it should. Every catalog function needs a `plain.ts` entry (`unphrasedFunctionIds()` enforces this).
- `tests/correctness.test.ts` - the "valid SEL but can never work" rules (negate/merge self-reference, count() >= 0, inverted ranges, string escaping).

Adding a catalog function or a validity rule without a test in the matching file is incomplete, not just untested.

## Conventions

- Comments explain *why*, briefly. One line, occasionally two. If a comment restates what the code obviously does, delete it instead of shortening it.
- No em dashes (`—`) or en dashes (`–`) anywhere - hyphens only.
- No unnecessary abstraction. Three similar lines beat a premature helper.
- Tailwind utility classes inline; no CSS-in-JS.
