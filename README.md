<div align="center">

# 🧭 agent-router

### Stop memorizing which of your 300 skills to use. Just ask.

**A Claude Code plugin that discovers every installed skill & subagent, ranks them for the task at hand, and routes to the best one — wrapped in a conversational assistant named [Hina](#-meet-hina) and backed by a [self-contained engineering team](#-the-build-team) that can build anything end-to-end.**

[![Version](https://img.shields.io/badge/version-0.5.1-6E56CF)](./CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-22C55E.svg)](./LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-plugin-D97757)](https://docs.anthropic.com/en/docs/claude-code)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-0EA5E9.svg)](./CONTRIBUTING.md)

[Install](#-install) · [Meet Hina](#-meet-hina) · [How routing works](#-how-routing-works) · [The build team](#-the-build-team) · [Discover tools](#-discover-tools-you-dont-have-yet)

</div>

---

## The problem

You install Claude Code, then ECC, ruflo, voltagent, claude-code-workflows… and suddenly you have **hundreds of skills and subagents**. Nobody remembers them all. So you fall back to the same three you know — and the perfect specialist for your task sits unused.

**agent-router fixes that.** Describe what you want; it finds the right tool out of everything you have installed, routes to it, and learns from whether the pick was good.

```
You:  "review this Go file for concurrency bugs"
                          │
                 ┌────────▼────────┐
                 │   agent-router   │  indexes every installed skill/agent (BM25 + dense)
                 │                  │  scores: relevance + specificity + reputation
                 └────────┬────────┘
                          │  ranked shortlist
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
  ecc:go-reviewer   voltagent:golang-pro   (baseline) code-reviewer
   ★ 92  routed       ★ 78                   ★ 61
        │
        ▼
   runs it → shows the diff → you rate it 1–4 → it gets smarter on YOUR setup
```

---

## ✨ What you get

| Layer | Command | What it does |
|---|---|---|
| 🗣️ **Hina** — the assistant | `/hina` | Conversational front door. Remembers you across sessions, asks before guessing, routes the work, does it, learns from your feedback. |
| 🧭 **Router** — the engine | `/agent-router` | Ranks every installed skill/agent for a task and routes to (or recommends) the best one. |
| 🔭 **Discovery** | `/agent-router:skill-finder` | Browses the marketplace and ranks *uninstalled* skills/agents by rating, with the exact install command. |
| 👷 **The build team** | (auto-routed) | 14 baseline agents covering the full build lifecycle — so there's *always* something competent to route to, even with zero other plugins installed. |
| 🔀 **Orchestrator** | `/agent-router:agent-router-orchestrate` | Decomposes a multi-step build into a DAG and fans tasks out across specialists (parallel + sequential). |

---

## 🚀 Install

The recommended path is the Claude Code plugin — **no npm required**. Run **both** lines, **in this order** (the first registers this repo as a marketplace; the second installs the plugin from it):

```text
/plugin marketplace add RamanaNani/agent-router
/plugin install agent-router@agent-router
```

> `agent-router@agent-router` reads as `<plugin>@<marketplace>`. If you run the install line first you'll get **"Marketplace not found"** — add the marketplace first.

Then reload so the new skills register:

```text
/reload-plugins
```

That's it. You now have `/agent-router`, `/hina`, `/agent-router:skill-finder`, the orchestrator, and the full baseline team.

<details>
<summary><b>How does the bare <code>/hina</code> command work?</b></summary>

Plugin skills are **namespaced under their plugin** in Claude Code, so a skill shipped inside the plugin would answer to `/agent-router:hina`. To give you a clean bare `/hina`, a `SessionStart` hook installs Hina as a **user-scope** skill in `~/.claude/skills/hina/` (the same mechanism gstack uses for `/browse`, `/review`, etc.). The copy is re-synced from the plugin on every version bump, so it can never drift stale. Once invoked, Hina stays resident for the rest of the session, so you only type it once. If `/hina` doesn't appear immediately after install, run `/reload-plugins` (or start a new session) so the hook can deploy it.
</details>

---

## 🗣️ Meet Hina

> *Hina is the product; agent-router is the routing engine underneath her.*

Hina is your conversational personal assistant for Claude Code. You talk to her in plain language — she does the rest:

- 🧠 **Remembers you across sessions.** File-based memory (profile + past observations), read at the start of every session. No model weights, no cloud — just files under `~/.claude/`.
- 🙋 **Asks before guessing.** When a gap would change the outcome, she clarifies instead of assuming. When it wouldn't, she just acts.
- 🎯 **Routes to the right specialist.** Every task is scored against your installed tools and dispatched to the best match.
- 📈 **Gets better from your feedback.** Rate a route 1–4 and the learning loop adapts to the tools *you* actually keep choosing.
- 💬 **Lives in the main loop**, so she can pause mid-task and ask you a question — something a dispatched subagent can't do.

```text
/hina
```

She stays resident for the rest of the session (no need to re-type) until you say **"exit hina"** or the session ends.

---

## 🧭 How routing works

Given any task, the router:

1. **Indexes** every installed skill/agent — top-level `~/.claude/`, project `./.claude/`, **and the full plugins tree** — then retrieves the top candidates with **BM25 + optional dense embeddings, RRF-fused**. Scales to thousands of tools instead of only what's in the session list.
2. **Scores** each `0–100 = relevance (60) + specificity (20) + reputation (20)`. Reputation blends the curated `data/registry.json` baseline with your private *learned overlay*.
3. **Ranks & routes** — shows a ranked table (why each won, what the runner-up is better at) and routes to / recommends the top pick.
4. **Learns** — you rate the route; the bandit folds it into your overlay. If nothing installed fits, it falls back to `/agent-router:skill-finder`.

### The learning loop

```bash
# After you've used the routed tool, score it (1=bad 2=ok 3=good 4=excellent):
node ~/.claude/agent-router/scripts/feedback.js
node ~/.claude/agent-router/scripts/feedback.js good          # score the last route directly
node ~/.claude/agent-router/scripts/feedback.js wrong codex   # mark wrong + name the better pick

# Fold ratings into the scores (run periodically):
node ~/.claude/agent-router/scripts/learn.js          # trains the bandit → private overlay
node ~/.claude/agent-router/scripts/review-logs.js    # most-routed tools, gaps, avg rating
```

> 🔒 **Your data stays private.** The curated reputation (`data/registry.json`) ships with the plugin and is identical for everyone. Everything personal — your decision log and learned overlay — lives only under `~/.claude/agent-router/` and is **never committed or published**.

---

## 👷 The build team

Routing is only useful if there's *always something competent to route to*. So the plugin ships a **complete baseline crew** that can build anything end-to-end **with zero external plugins installed** — and yields to a better specialist whenever one *is* installed.

| Stage | Baseline agent | Prefers when installed |
|---|---|---|
| Requirements | `requirements-analyst` | — |
| Visualization | `ux-visualizer` | — |
| Architecture | `solution-architect` | `ecc:architect` |
| Frontend | `frontend-engineer` | `voltagent-lang:react-specialist`, … |
| Backend | `backend-engineer` | `voltagent-core-dev:backend-developer`, … |
| Data | `data-engineer` | `ecc:database-reviewer` |
| Build/type fixes | `build-fixer` | `ecc:*-build-resolver` |
| Security gate | `security-engineer` | `ecc:security-reviewer` |
| QA gate | `qa-verifier` | `ecc:e2e-runner` |
| Review | `code-reviewer` | language-specific reviewers |
| Debug | `debugger` | — |
| Explore | `researcher` | `ecc:code-explorer` |
| Orchestration | `delivery-orchestrator` | — |

Every agent embeds **four mandatory dispatch guardrails**: plan before high-risk edits · verify by running (observed, not assumed) · security is non-negotiable (any plaintext secret = compromised → rotate now) · close with proof. See [`TEAM.md`](./TEAM.md) for the full roster, philosophy, and an end-to-end walkthrough.

---

## 🔭 Discover tools you don't have yet

```text
/agent-router:skill-finder
```

Ranks highly-rated skills/agents from the marketplace you *haven't* installed, with the exact install command for each — so new users know what's worth adding.

---

## 🗂️ Layout

```text
agent-router/
├── .claude-plugin/
│   ├── plugin.json                       # plugin manifest (skills + dependencies)
│   └── marketplace.json                  # marketplace entry for /plugin install
├── skills/
│   ├── agent-router/SKILL.md             # the routing skill (recommend + dispatch)
│   └── skill-finder/SKILL.md             # marketplace discovery
├── assets/hina/SKILL.md                  # Hina — deployed to ~/.claude/skills/hina (bare /hina)
├── agents/                               # 14 baseline build-team agents + advisor
├── scripts/
│   ├── build-index.js                    # retrieval index (BM25 + dense, RRF-fused)
│   ├── feedback.js · learn.js            # rating capture + learning bandit
│   ├── review-logs.js · update-check.js
│   ├── hina-memory.js · hina-bootstrap.js
│   └── install.js                        # npx installer (copies into ~/.claude)
├── workflows/agent-router-orchestrate.js # DAG orchestrator (parallel/sequential)
├── data/registry.json                    # curated reputation (shipped, shareable)
└── TEAM.md · DESIGN.md · CHANGELOG · CONTRIBUTING · SECURITY · CODE_OF_CONDUCT · LICENSE
```

Personal/runtime data (decision log, learned overlay, retrieval index) lives under `~/.claude/agent-router/` — never in the repo.

---

## 🤝 Contributing

Issues and PRs welcome — see [`CONTRIBUTING.md`](./CONTRIBUTING.md) and [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md). Security reports: [`SECURITY.md`](./SECURITY.md).

## 📄 License

[MIT](./LICENSE) © Ramana Reddy
