# Changelog

All notable changes to agent-router are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project adheres to
[Semantic Versioning](https://semver.org/).

## [0.5.2] - 2026-06-18
### Added
- **Bare `/hina` command.** Hina is now deployed as a user-scope skill
  (`~/.claude/skills/hina/`) by the `SessionStart` hook, so she answers to `/hina`
  instead of the namespaced `/agent-router:hina`. The copy is re-synced from the
  plugin on every version bump, so it can never drift stale (this is the same
  user-scope mechanism gstack uses for `/browse`, `/review`, etc.).
### Changed
- Moved the canonical Hina skill from `skills/hina/` to `assets/hina/` so the plugin's
  `./skills/` glob no longer also exposes a namespaced duplicate. There is now exactly
  one Hina command: `/hina`.
- Rewrote `README.md` into a proper landing page (badges, routing diagram, feature table,
  build-team roster, Hina section).
### Fixed
- `package.json` version was stuck at `0.2.0` while the plugin shipped `0.5.x`; the npm
  metadata now tracks the plugin version. Added `assets/` to the published `files`.

## [0.5.1] - 2026-06-17
### Fixed
- Dropped the hard `marketingskills` plugin dependency that could block the plugin from
  loading when that marketplace wasn't registered.

## [0.5.0] - 2026-06-17
### Added
- **Self-contained engineering team.** 10 new baseline agents covering the full build
  lifecycle — `requirements-analyst`, `ux-visualizer`, `solution-architect`,
  `frontend-engineer`, `backend-engineer`, `data-engineer`, `build-fixer`,
  `security-engineer`, `qa-verifier`, and the `delivery-orchestrator` — so there is always
  a competent tool to route to even with zero external plugins installed. Each yields to a
  better specialist when one is present. Documented in `TEAM.md`.
- **Gated build pipeline** with hard validation gates (QA-verify gate, security + review
  gate) before ship, driven by the `delivery-orchestrator`.
- **Hina** — a conversational, session-resident personal assistant that remembers you
  across sessions (file-based memory), clarifies before acting, routes via agent-router,
  and learns from your feedback.
- **Hybrid memory** for Hina: lexical (BM25) + dense (cosine) recall, RRF-fused.
- **Four mandatory dispatch guardrails** embedded in every agent: plan before high-risk
  edits, verify by running, rotate exposed secrets immediately, close with proof.
- Native plugin `dependencies` + a `SessionStart` hook that registers the upstream
  marketplaces so specialists resolve on a one-line install.

## [0.2.0] - 2026-06-15
### Added
- **4-level feedback rating** (`feedback.js`): bad/ok/good/excellent → reward
  0/0.34/0.67/1. Interactive keypress rater plus a scriptable direct mode that
  accepts `1-4`, `b/o/g/e`, or words.
- **Learning loop** (`learn.js`): discounted Thompson-sampling bandit trains on the
  graded ratings and writes a personal reputation overlay.
- **Retrieval index** (`build-index.js`): BM25 + optional dense embeddings, RRF-fused,
  over every installed skill/agent including the full plugins tree. Routing retrieves
  top-K candidates from it instead of eyeballing the session list.
- **Auto-update check** (`update-check.js`): daily-cached version check against GitHub.
- **Auto web/marketplace fallback**: routing runs `/skill-finder` automatically when
  no installed tool fits the task.
- **Shareable/private separation**: the repo ships only the curated
  `data/registry.json`; all personal data (decision log, learned overlay, retrieval
  index) lives under `~/.claude/agent-router/` and is never committed or published.

- **Consolidated run summary**: dispatched agents return a structured `## What I did`
  section, and the router prints a per-agent **Run summary** (files changed, verification,
  flags) after they finish — so multi-agent runs are legible at a glance.

### Fixed
- `install.js` usage text now says `npx claude-agent-router` (was `npx agent-router`).
- The npm tarball no longer includes the machine-specific generated index.
- Plugin manifest: removed the invalid `agents` field that failed install validation
  (`agents: Invalid input`). The agent auto-discovers from the `agents/` directory.

## [0.1.0] - 2026-06-07
### Added
- Initial release: the `/agent-router` routing skill, the advisor agent, the
  `/skill-finder` discovery skill, the curated reputation registry, the npx
  installer, the DAG workflow, and decision logging.

[0.2.0]: https://github.com/RamanaNani/agent-router/releases/tag/v0.2.0
[0.1.0]: https://github.com/RamanaNani/agent-router/releases/tag/v0.1.0
