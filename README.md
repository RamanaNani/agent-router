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
Publish once:
```
npm login
npm publish --access public
```
Then anyone installs the skill + agent into their Claude config with:
```
npx agent-router            # installs to ~/.claude (user scope)
npx agent-router --project  # installs to ./.claude (project scope)
```

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

## Customize the reputation scores
Edit `data/registry.json` — add `{ name, type, score, source, notes }` entries for
tools you trust. Unknown tools default to a neutral score of 10.

## Layout
```
agent-router/
├── package.json                 # npm metadata + bin -> scripts/install.js
├── scripts/install.js           # npx installer (copies into ~/.claude)
├── .claude-plugin/
│   ├── plugin.json              # plugin manifest (skills + agents)
│   └── marketplace.json         # marketplace entry for /plugin install
├── skills/agent-router/SKILL.md # the routing skill (recommend + dispatch)
├── skills/skill-finder/SKILL.md # marketplace discovery (browse + rank by rating)
├── agents/agent-router.md       # the advisor subagent (recommend only)
├── data/registry.json           # curated reputation of installed tools
└── data/marketplace.json        # curated discovery catalog (skill-finder)
```

## License
MIT
