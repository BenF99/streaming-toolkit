# Streaming Toolkit

Visual builders for [AIOStreams](https://github.com/Viren070/AIOStreams)' config-time mini-languages - compose values instead of hand-writing syntax against the reference docs.

## Tools

- **Exit Condition Builder** - builds AIOStreams Dynamic Exit Conditions (Stream Expression Language). Menus only offer values that type-check, parser-enforced bounds are enforced in the controls, and expressions that are syntactically valid but logically pointless (`negate(X, X)`, `count(X) >= 0`, ...) are flagged inline rather than left to fail at runtime. A live English readback shows what the expression actually does, and an existing expression can be pasted in to edit visually.

More tools are planned; the tab bar hints at what's next.

## Structure

```
components/
  ui/               Shared primitives - buttons, chips, menus, icons
  layout/           App shell, tab bar, theme toggle
  exit-condition/   Exit Condition Builder UI
lib/
  exit-condition/   Exit Condition Builder domain logic
```

Each tool owns a `lib/<tool>` and `components/<tool>` pair; everything shared lives in `components/ui` and `components/layout`. See [CLAUDE.md](CLAUDE.md) for the internals of a given tool.

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm test
npm run typecheck
npm run lint
npm run build       # static export to ./out
```

## Deployment

`.github/workflows/cicd.yml` runs lint, typecheck, and tests on every push and pull request; pushes to `main` additionally build and deploy to GitHub Pages once those checks pass.

## Releases

[release-please](https://github.com/googleapis/release-please) tracks [Conventional Commits](https://www.conventionalcommits.org/) and keeps a standing PR with the next version bump and changelog. Merging it tags the release.
