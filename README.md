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

## Install / register — two ways

### A) Claude Code plugin (no npm needed)
Push this repo to GitHub, then anyone runs:
```
/plugin marketplace add RamanaNani/agent-router
/plugin install agent-router@agent-router
```
(The `.claude-plugin/marketplace.json` and `plugin.json` make this work.)

### B) npx installer (published to npm)
Published as **[`claude-agent-router`](https://www.npmjs.com/package/claude-agent-router)**.
Anyone installs the skill + agent into their Claude config with:
```
npx claude-agent-router            # installs to ~/.claude (user scope)
npx claude-agent-router --project  # installs to ./.claude (project scope)
```
This also installs the registry/discovery data and the log-review tool under
`~/.claude/agent-router/`. (The npm package name is `claude-agent-router`; the
GitHub repo and Claude Code plugin are named `agent-router`.)

## Use it
```
/agent-router
```
or just ask: *"which agent should I use to review this Go file?"*

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
