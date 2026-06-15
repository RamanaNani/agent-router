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
1. Inventories candidates from the session list, `~/.claude/`, `./.claude/`, and plugins.
2. Scores each 0-100 = relevance (60) + specificity (20) + reputation (20, from `data/registry.json`).
3. Shows a ranked table and routes to / recommends the top pick.

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

### npx installer (full toolkit, incl. the rating + learning scripts)
```
npx claude-agent-router            # installs to ~/.claude (user scope)
npx claude-agent-router --project  # installs to ./.claude (project scope)
```
Use this if you want the rating/learning loop: it also copies the helper scripts
(`feedback.js`, `learn.js`, `review-logs.js`) and the curated data into
`~/.claude/agent-router/`. (npm package: `claude-agent-router`; the GitHub repo and
plugin are named `agent-router`. The `0.2.0` publish with the learning loop is
pending — until then, get the scripts via the plugin/clone and run them from `scripts/`.)

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

## Discover new skills (for new users)
Empty `~/.claude/`? Use the companion **skill-finder** skill to browse the
marketplace and find highly-rated tools to install:
```
/skill-finder
```
or ask: *"what skills are available for testing?"* It checks what you already
have, then ranks *uninstalled* candidates by **relevance + rating** (GitHub stars
or curated score), shows each source link, and gives you the exact `/plugin
install` (or `npx`) command. Candidates come from a live web/GitHub search plus
the curated catalog in `data/marketplace.json` — it never invents repos.

## Use it internally first (dogfood with logs)
Both skills append a JSON line to `~/.claude/agent-router/logs/decisions.jsonl`
every time they run — the task, what they picked, and (for skill-finder) what was
missing. After a week or two of real use:
```
node scripts/review-logs.js
```
prints a summary: most-routed tools, misroutes you flagged, and the capabilities
you keep needing but don't have. Use it to tune `data/registry.json` scores and
decide which skills to build before publishing. The log lives in `~/.claude`
(personal) — it is **not** committed to the repo.

## Customize the reputation scores
Edit `data/registry.json` — add `{ name, type, score, source, notes }` entries for
tools you trust. Unknown tools default to a neutral score of 10.

## Layout
```
agent-router/
├── package.json                          # npm metadata (claude-agent-router) + bin
├── scripts/install.js                    # npx installer (copies into ~/.claude)
├── scripts/review-logs.js                # summarizes the decision log (dogfooding)
├── workflows/agent-router-orchestrate.js # DAG orchestrator (parallel/sequential, /workflows)
├── .claude-plugin/
│   ├── plugin.json                       # plugin manifest (skills + agents)
│   └── marketplace.json                  # marketplace entry for /plugin install
├── skills/agent-router/SKILL.md          # the routing skill (recommend + dispatch)
├── skills/skill-finder/SKILL.md          # marketplace discovery (browse + rank by rating)
├── agents/agent-router.md                # the advisor subagent (recommend only)
├── data/registry.json                    # curated reputation of installed tools
├── data/marketplace.json                 # curated discovery catalog (skill-finder)
└── FINDINGS.md                           # research-validated design notes + citations
```

## License
MIT
