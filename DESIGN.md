# agent-router — Design & Roadmap

**Status:** v0.1.0 published · next milestone v0.2 (reconcile + learning)
**Repo:** github.com/RamanaNani/agent-router · **npm:** `claude-agent-router`
**Last updated:** 2026-06-15

---

## What it is

A Claude Code skill + agent that inventories every installed skill and subagent,
ranks them for the task at hand, and routes to the best one — so you don't have to
remember which of your dozens of tools to reach for. A companion skill
(`/skill-finder`) extends this outward to the marketplace, ranking highly-rated
tools you haven't installed yet.

## Why it exists

Power users accumulate dozens to hundreds of skills and subagents. The right
specialist exists but goes unused because nobody remembers it's installed, so tasks
get handled generically. agent-router makes the full set of tools legible and
picks for you.

## Positioning — what makes it worth installing

Claude Code already auto-invokes skills by matching a task to descriptions. A plain
"route my task" tool would overlap with that built-in behavior. agent-router earns
its place through the three things the harness does **not** do:

1. **Transparency** — a ranked "here are the best 3, here's *why* this one won, and
   the runner-up is better when X." Built-in matching is invisible and picks one
   tool with no explanation. agent-router shows the menu and the reasoning.
2. **Discovery** — ranks highly-rated tools you do **not** have installed yet and
   gives the exact `/plugin install` / `npx` command. The harness can only match
   what's already present; this points outward to the marketplace.
3. **Learning** — adapts to the tools you actually keep choosing, so routing gets
   better on your setup over time.

The headline is transparency + discovery + learning. "Routing" is the mechanism,
not the pitch.

## How it works

Given a task, it:

1. **Inventories** candidates from the session list, `~/.claude/`, `./.claude/`,
   and installed plugins.
2. **Scores** each 0–100 = relevance (60) + specificity (20) + reputation
   (20, from `data/registry.json`).
3. **Ranks and routes** — shows a ranked table and either dispatches to or
   recommends the top pick.

Two entry points:

- **Skill** (`/agent-router`) — can recommend **and** dispatch (run by the main
  agent, which can call other skills/agents).
- **Agent** (`subagent_type: agent-router`) — recommends a ranked shortlist only
  (read-only advisor; subagents can't spawn subagents).

## Current state (verified against git + npm)

| Piece | State |
|---|---|
| `claude-agent-router@0.1.0` on npm | Published (2026-06-07) — simple prompt-scorer |
| GitHub repo, commit `da18205` | Public — simple prompt-scorer |
| Routing skill + advisor agent + `/skill-finder` | Shipped |
| `data/registry.json` (curated reputation) | Shipped |
| `scripts/learn.js` — discounted Beta-Bernoulli / Thompson-sampling bandit | Built; trains on graded ratings, writes the learned overlay to the **private** `~/.claude/agent-router/learned.json` |
| `scripts/build-index.js` — BM25 + optional dense embeddings, fused with RRF | Built and **wired into routing** — indexes all installed skills (top-level + the full plugins tree) to the private `~/.claude/agent-router/skills-index.json`; the router retrieves top-K candidates from it instead of eyeballing the session list |
| `scripts/update-check.js` — daily-cached version check vs GitHub | Built; the skill surfaces a one-line "update available" notice |
| `scripts/feedback.js` — 4-level rating capture (bad/ok/good/excellent → reward 0/0.34/0.67/1) | Built; interactive keypress rater + scriptable direct mode |
| Shareable-vs-private data separation | Built; repo ships only the curated `data/registry.json`, all personal data (decision log + learned overlay) lives under `~/.claude/agent-router/` and is gitignored |

The honest summary: the research-backed engines (bandit + retrieval) are built, the
4-level feedback loop is wired, and personal data is cleanly separated from the
shareable package. The remaining work before sharing is purely release mechanics:
commit, push, and republish npm so the public artifact matches this working tree.

## Research foundation

The retrieval and learning designs come from an adversarially-verified research run
(see `FINDINGS.md`). Two findings reached high confidence:

- **Retrieval:** hybrid dense + BM25 fused with Reciprocal Rank Fusion, then LLM
  rerank; flat search under ~10K vectors, HNSW above. A small embedder is the
  cost-effective default (for cost, not because it's more accurate).
- **Learning:** a contextual bandit over (domain, tool) using Thompson Sampling /
  UCB, with a discount factor or sliding window so it adapts when a tool's quality
  drifts over time. Reward should come from user acceptance and task success, not
  automated text metrics.

`build-index.js` implements the retrieval finding; `learn.js` implements the
learning finding.

## Roadmap

### v0.2 — reconcile + make learning real

1. **Reconcile the repo with reality.** Commit `learn.js`, `build-index.js`,
   `skills-index.json`. Fix the `install.js` usage comment. Decide whether the
   engines sit on the default path or are labeled experimental until calibrated.
2. **Wire the feedback loop (the linchpin).** The decision log has `outcome` and
   `feedback` fields but always writes them empty, so the bandit has nothing to
   learn from. Build one concrete capture mechanism — e.g. a follow-up
   `/agent-router feedback <good|wrong> [better-tool]` that annotates the last log
   row, or a post-dispatch prompt.
3. **Reposition** the README and skill/agent descriptions around transparency +
   discovery + learning.
4. **Demo** — record the three-part story: ranked table with reasoning →
   marketplace discovery → a `review-logs.js` readout that previews the learning.
5. **Re-release** — bump the version, `npm publish`, and verify the published
   tarball actually contains the engines (`npm pack` → inspect). Confirm both
   install paths on a clean config.
6. **Dogfood + seed** — use it on a real 100+ tool setup to populate genuine
   outcome/feedback, then post the demo where Claude Code users gather.

### Held in reserve — the audit hook

`/agent-router audit`: "You have 147 skills/agents installed. Here are the 11 you
actually use, and 9 highly-rated ones you're missing." A screenshot-native hook
that turns the decision log into a personal-analytics story. Strongest as a
post-v0.2 follow-up to give the repo a second moment.

## Success criteria for v0.2

- Engines committed and pushed; `install.js` name fixed; a fresh publish whose
  tarball matches the repo; both install paths verified on a clean config.
- README leads with the three differentiators and includes a real demo.
- The decision log carries non-empty `outcome`/`feedback` for real routes, and
  `node scripts/learn.js` produces a sensible updated `registry.json` from them.
- Seeded in at least two venues; a one-paragraph pitch suitable for a profile link.

## Open questions

- **Ship the engines on the default path now, or keep them experimental** until the
  feedback loop produces real calibration data?
- **Where to seed** — which specific venues for Claude Code users (subreddit,
  Discord, X, the plugin marketplace, Show HN)?
- **Audit hook timing** — fold into the v0.2 demo, or ship as the first follow-up?

## Distribution

- **Channels (live):** GitHub repo (canonical home), Claude Code plugin via
  `.claude-plugin/`, npm package `claude-agent-router` via `scripts/install.js`.
- **Release process:** a documented manual checklist is sufficient for a solo
  project — commit → bump → `npm publish` → verify both install paths. (CI is a
  later nice-to-have, not a v0.2 requirement.)

## Constraints

Built for personal use, fun, and profile visibility — not as a company. Solo
builder with intermittent time, so each milestone must reach a shippable artifact
without a long uninterrupted build. The learning capability can't be honestly
demoed until real outcome data exists; the plan sequences dogfooding accordingly.

## License

MIT
