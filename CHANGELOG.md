# Changelog

All notable changes to agent-router are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project adheres to
[Semantic Versioning](https://semver.org/).

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
