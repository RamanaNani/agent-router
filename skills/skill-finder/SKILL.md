---
name: skill-finder
description: Browse and discover Claude Code skills, agents, and plugins from the marketplace — ranked by rating — that are NOT yet installed. Use when the user is new and has few/no specialists installed, asks "what plugins/skills are available for X", "find me a skill for Y", "what should I install", "browse the marketplace", or when agent-router finds no installed tool that fits. Returns a ranked shortlist with real ratings, source links, and the exact install command.
---

# Skill Finder — marketplace discovery

Where `agent-router` routes among tools you ALREADY have, `skill-finder` discovers
tools you DON'T have yet. It searches the marketplace, ranks candidates by rating,
and hands back the exact install command. Built for a new user whose `~/.claude/`
is empty or thin.

## When to use
- A new user wants to know what's worth installing for their kind of work.
- The user asks "find/browse skills for X", "what plugin does Y", "what should I install".
- `agent-router` found nothing installed scoring ≥ 25 → fall through to here.

## Procedure

### 1. Capture the need
One sentence: the domain + task (code review, testing, security, infra, data,
research, design…). Note any language/framework constraint.

### 2. Don't recommend what they already have
Quickly scan installed tools (the session list, `~/.claude/`, `./.claude/`, and
installed plugins) so the shortlist is all NEW installs. If a good specialist is
already installed, say so and route to it instead (defer to `agent-router`).

### 3. Gather candidates — real ones only
Merge two sources:
- **Curated catalog**: `data/marketplace.json` (verified entries + ratings).
- **Live search** (preferred, for freshness):
  - GitHub: repositories matching `claude code <domain> plugin|skill|agent`,
    sorted by stars (use the GitHub search tool or a web search).
  - Web: `<domain> claude code skill OR plugin OR subagent`.
  For each candidate capture: name, what it does, a **rating signal** (GitHub
  stars or curated score), the source URL, and how to install it.

NEVER invent a repo, package, or star count. List only candidates that appear in
the catalog or in a real search result, and include the URL so the user can verify.

### 4. Rank (0-100)
- **Relevance (0-50)**: match to the task/domain.
- **Rating (0-35)**: GitHub stars (log-scaled) or curated `rating`. Unknown → 10.
- **Maintenance (0-15)**: recent commits / not archived. Unknown → 7.

Drop anything below relevance 15 — discovery should stay on-topic.

### 5. Present the shortlist
Top 3-5 as a table: rank, name, what it does, rating (e.g. `★ 1.2k` or `score 80`),
source link. Then, for the top pick, show the **exact install command**:
```
/plugin marketplace add <owner>/<repo>
/plugin install <plugin>@<marketplace>
```
or `npx <package>` when the project ships an npm installer.

### 6. Offer to install
Installing plugins is done by the USER via `/plugin …` — you cannot run those
slash commands for them. Lay out the 1-2 commands and offer to walk through it.
If the pick is an `npx` installer, you may run it via Bash once the user confirms.

## Rules
- Honesty over coverage: a short list of real, linked tools beats a long invented one.
- Always show the source URL and the install command — discovery is useless without them.
- State the rating's basis (GitHub stars vs. curated score) so it isn't mistaken for gospel.
- If live search is unavailable and the catalog is thin, say so and show what you have.
- After install, hand off to `agent-router` to actually route the task.
