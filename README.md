# agent-router

A Claude Code **skill + agent** that discovers every installed skill and subagent,
ranks them for the task at hand, and routes to the best one — so you don't have to
remember which of your dozens of skills/agents to use.

- **Skill** (`/agent-router`): can recommend **and dispatch** to the chosen tool
  (run by the main agent, which can call other agents/skills).
- **Agent** (`subagent_type: agent-router`): recommends a ranked shortlist only
  (read-only advisor).
- **Discovery** (`/skill-finder`): for new users — browses the marketplace and
  ranks *uninstalled* plugins/skills/agents by rating so you know what to install.

## How it works
Given a task, it:
1. **Indexes** every installed skill/agent — top-level `~/.claude/`, project `./.claude/`,
   **and the full plugins tree** — then retrieves the top candidates with BM25. This scales
   to thousands of skills instead of only seeing what's in the session list.
2. **Scores** each 0-100 = relevance (60) + specificity (20) + reputation (20). Reputation
   blends the curated `data/registry.json` baseline with your private *learned overlay*.
3. **Ranks and routes** — shows a ranked table and routes to / recommends the top pick.
4. **Learns** — you rate each route (bad/ok/good/excellent) and it adapts to the tools you
   actually keep choosing. If nothing installed fits, it falls back to `/skill-finder`.

## Install

### Claude Code plugin (recommended — no npm needed)
Run **both** commands, **in this order**. The first registers this repo as a
marketplace; the second installs the plugin from it:
```
/plugin marketplace add RamanaNani/agent-router
/plugin install agent-router@agent-router
```
`agent-router@agent-router` reads as `<plugin>@<marketplace>`. If you run the
install line first you'll see **"Marketplace not found"** — add the marketplace
first. This installs the `/agent-router` and `/skill-finder` skills plus the
advisor agent, pulled directly from this public GitHub repo (there is no central
registry — anyone can add any repo as a marketplace).

### npx installer (coming with 0.2.0 — not published yet)
Once published, this will install everything — skills, agent, curated data, and the
rating/learning scripts — into `~/.claude/agent-router/`:
```
npx claude-agent-router            # user scope  (NOT published yet)
npx claude-agent-router --project  # project scope
```
**For now, use the plugin install above** (it's current), or clone the repo and run the
scripts from `scripts/`. npm package will be `claude-agent-router`; the repo and plugin
are named `agent-router`.

## Using the skills

**1. Route a task** — run the skill; it ranks your installed skills/agents and routes
to the best one:
```
/agent-router
```
or just ask in plain language: *"which agent should I use to review this Go file?"*
You get a ranked table (top picks + why each won, what the runner-up is better at),
then it routes to or recommends the winner.

**2. Rate the result so it learns** — after you've actually used the routed tool,
score it on a 4-level scale. This is what makes the router improve on *your* setup:
```
node ~/.claude/agent-router/scripts/feedback.js        # interactive: press 1=bad 2=ok 3=good 4=excellent
node ~/.claude/agent-router/scripts/feedback.js good   # or score the last route directly
node ~/.claude/agent-router/scripts/feedback.js wrong codex   # mark it wrong + name the better pick
```
Tip: `alias f='node ~/.claude/agent-router/scripts/feedback.js'` — then just press `f`.

**3. Fold ratings into the scores** (run periodically):
```
node ~/.claude/agent-router/scripts/learn.js        # trains the bandit, updates your private overlay
node ~/.claude/agent-router/scripts/review-logs.js  # summary: most-routed tools, gaps, avg rating per tool
```

**4. Discover tools you don't have** — `/skill-finder` ranks highly-rated skills/agents
from the marketplace you haven't installed yet, with the exact install command.

> The rating/learning scripts (step 2-3) ship with the `npx` install, or clone this
> repo and run them from `scripts/`. Routing (1) and discovery (4) work from the
> plugin install alone.

### Your data stays private
The curated reputation (`data/registry.json`) ships with the package and is the same
for everyone. Everything personal — your decision log and the learned overlay — lives
only under `~/.claude/agent-router/` and is never committed or published.

## Tuning & dogfooding
Every routing/discovery decision is logged to
`~/.claude/agent-router/logs/decisions.jsonl` (local only, never committed). Use it to
make routing better over time:

- **Rate routes** — see [Using the skills](#using-the-skills) step 2, so `learn.js` adapts.
- **Review the log** — `review-logs.js` prints most-routed tools, misroutes you flagged,
  and capabilities you keep needing but don't have (gaps worth installing/building).
- **Tune the curated scores** — edit `data/registry.json`: add
  `{ name, type, score, source, notes }` for tools you trust; unknown tools default to 10.

Run the scripts from `~/.claude/agent-router/scripts/` (npx install) or `scripts/`
(if you cloned the repo).

## Layout
```
agent-router/
├── package.json                          # npm metadata (claude-agent-router) + bin
├── .claude-plugin/
│   ├── plugin.json                       # plugin manifest (skills; agent auto-discovered)
│   └── marketplace.json                  # marketplace entry for /plugin install
├── skills/agent-router/SKILL.md          # the routing skill (recommend + dispatch)
├── skills/skill-finder/SKILL.md          # marketplace discovery (browse + rank by rating)
├── agents/agent-router.md                # the advisor subagent (recommend only)
├── scripts/
│   ├── build-index.js                    # retrieval index over installed skills (BM25 + RRF)
│   ├── feedback.js                       # 4-level rating capture (1-4 / bad..excellent)
│   ├── learn.js                          # bandit: ratings -> private learned overlay
│   ├── review-logs.js                    # decision-log summary
│   ├── update-check.js                   # daily version check vs GitHub
│   └── install.js                        # npx installer (copies into ~/.claude)
├── workflows/agent-router-orchestrate.js # DAG orchestrator (parallel/sequential, /workflows)
├── data/registry.json                    # curated reputation (shipped, shareable)
├── data/marketplace.json                 # curated discovery catalog (skill-finder)
└── DESIGN.md · FINDINGS.md · CHANGELOG · CONTRIBUTING · SECURITY · CODE_OF_CONDUCT · LICENSE
```
Personal/runtime data (decision log, learned overlay, retrieval index) lives under
`~/.claude/agent-router/` — never in the repo.

## License
MIT
