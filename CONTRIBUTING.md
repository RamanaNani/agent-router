# Contributing to agent-router

Thanks for helping improve agent-router — a Claude Code skill + agent that ranks
your installed skills/agents for a task and routes to the best one.

## Dev setup
```bash
git clone https://github.com/RamanaNani/agent-router.git
cd agent-router
node scripts/install.js          # copy skills/agents/data/scripts into ~/.claude for local testing
```
No build step and no runtime dependencies — everything is plain Node.js (≥ 18).

## Layout
See the **Layout** section of the [README](README.md). In short: `skills/` and
`agents/` are the installable surface; `data/` holds the curated registry +
marketplace catalog; `scripts/` holds the Node helpers; `.claude-plugin/` makes it a
Claude Code plugin.

## Common contributions

**Adjust curated reputation** — edit `data/registry.json`: add
`{ name, type, score, source, notes }`. Unknown tools default to 10. Never invent
tools or fabricate scores.

**Add a discovery entry** — edit `data/marketplace.json` (used by `/skill-finder`).
Only add real, installable entries you have verified; never invent repos or stars.

**Work on the scripts** (run from `scripts/`):
- `build-index.js` — retrieval index over installed skills (BM25 + RRF).
- `learn.js` — bandit that turns ratings into a personal reputation overlay.
- `feedback.js` — the 4-level rater (`1-4` / `b/o/g/e` / words).
- `review-logs.js` — decision-log summary.
- `update-check.js` — version check vs GitHub.

## Privacy rule (important)
Personal/runtime data — the decision log, learned overlay, and retrieval index —
lives under `~/.claude/agent-router/` and is gitignored. Never commit it, and never
add generated files (like `data/skills-index.json`) to the repo or the npm `files` list.

## Before opening a PR
- `node --check scripts/*.js` passes.
- No secrets, PII, or machine paths in the diff.
- Add a CHANGELOG.md entry under the appropriate version/Unreleased heading.
- Keep changes focused; describe what you ran and what you observed.

## Reporting bugs or ideas
Open a [GitHub issue](https://github.com/RamanaNani/agent-router/issues) with the
command you ran, what you expected, and what happened. For security issues, see
[SECURITY.md](SECURITY.md) instead.
