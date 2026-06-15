---
name: agent-router
description: When the user has a task and many skills/subagents installed and wants the BEST one chosen automatically. Use when the user says "which agent/skill should I use", "route this", "pick the best agent for", "what's the best skill for X", or asks you to find and dispatch the right specialist. Discovers all available skills and agents, ranks them for the task, and either recommends or dispatches to the top pick.
---

# Agent Router

A meta-router. Given a task, it inventories every skill and subagent available in
this session, scores them against the task, and routes to the best one.

## When to use
- The user is unsure which of the many installed skills/agents fits their task.
- The user explicitly asks to "route", "pick the best agent", or "find a skill for X".
- Before starting a non-trivial task, to confirm a specialist exists instead of doing it generically.

## Procedure

**Mode check (first):** If the invocation is `feedback <good|wrong> [note]`, skip
routing entirely and go straight to step 7 (score the last route). Otherwise run
steps 1-6 to route a task.

### 1. Capture the task
Restate the user's task in one sentence. Note the domain (code review, research,
testing, design, security, infra, data, etc.) and any constraints (language,
framework, speed vs. depth).

### 2. Inventory what's available
Build a candidate list from ALL of these sources:
- **Session list**: the skills and `subagent_type` values listed in the system
  context / system-reminders (these are already loaded — read their one-line
  descriptions).
- **User-level**: `~/.claude/agents/*.md` and `~/.claude/skills/*/SKILL.md`
  (read the `name` + `description` frontmatter of each).
- **Project-level**: `./.claude/agents/*.md` and `./.claude/skills/*/SKILL.md`.
- **Plugins**: any `*/agents/*.md` and `*/skills/*/SKILL.md` under installed plugins.

For each candidate record: `name`, `type` (skill|agent), `description`, `source`.

### 3. Score each candidate (0-100)
Combine three signals:
- **Relevance (0-60)**: semantic match between the task and the candidate's
  `description` + `name`. Exact-domain match scores high; generic matches low.
- **Specificity (0-20)**: a purpose-built specialist beats a catch-all
  (e.g. `python-reviewer` > generic `code-reviewer` for Python).
- **Reputation (0-20)**: combine two separate sources —
  1. the **curated baseline** registry (`tools[]`) — shareable, shipped with the
     package, the same for everyone. Read it from the installed location
     `~/.claude/agent-router/data/registry.json` (in this source repo it lives at
     `data/registry.json`); and
  2. your **personal learned overlay** at `~/.claude/agent-router/learned.json`
     (per-(domain,tool) scores from your own ratings — see step 7), which is private
     and never lives in the repo.

  Prefer the learned score when this (domain,tool) has been rated before; else use
  the curated score; else default 10. The skill only *references* the private
  overlay at runtime — internal/runtime data and the shareable skill stay separate.
  Optionally refine with a web search when the user wants "market findings".

Drop anything scoring < 25 as irrelevant.

### 4. Present the ranking
Show the top 3-5 as a table: rank, name, type, score, one-line reason. Always
state WHY the top pick won and what the runner-up would be better at.

### 5. Route
- If the top candidate is an **agent** and the user wants it done: dispatch it
  via the Task tool (`subagent_type: <name>`), passing the restated task.
- If the top candidate is a **skill**: invoke it via the Skill tool (or tell the
  user the `/command` to run).
- If two candidates are within 5 points, ask the user to choose (show both).
- If nothing scores ≥ 25, say so plainly. Then offer `/skill-finder` to browse the
  marketplace for a specialist to install — do NOT invent one that doesn't exist.

### 6. Log the decision (internal dogfooding)
After every routing decision, append ONE JSONL line to your decision log so you
can review and improve routing over time:
```bash
mkdir -p ~/.claude/agent-router/logs
echo '{"ts":"'"$(date -u +%FT%TZ)"'","skill":"agent-router","task":"<one-line task>","domain":"<domain>","chosen":"<name>","chosen_score":<0-100>,"runner_up":"<name|->","action":"<recommended|dispatched|none>","outcome":"","feedback":""}' >> ~/.claude/agent-router/logs/decisions.jsonl
```
Fill the placeholders; leave `outcome`/`feedback`/`rating`/`reward` empty — they get
filled later by the rating step (7). Misroutes and `"action":"none"` rows are the
highest-value signals — they show which `data/registry.json` scores to fix or which
new skill to add. Run `node scripts/review-logs.js` to summarize the log.

### 7. Capture a rating (closes the learning loop)
A route teaches the router nothing until it's rated — `learn.js` only trains on rows
that carry a `reward`. Rating uses a **4-level scale** that maps to a reward in [0,1]:

| rating | reward |
|--------|--------|
| bad | 0.0 |
| ok | 0.34 |
| good | 0.67 |
| excellent | 1.0 |

**When the user invokes `/agent-router feedback <bad|ok|good|excellent> [note]`**, skip
routing and run:
```bash
node scripts/feedback.js <bad|ok|good|excellent> [note]
```
It rates the most recent agent-router row in `~/.claude/agent-router/logs/decisions.jsonl`
(sets `rating`, `reward`, a back-compat `outcome`, and any note as `feedback`).

**In a plain terminal**, running it with no args opens an interactive rater that shows
the last route and waits for a single keypress:
```
[1] bad   [2] ok   [3] good   [4] excellent     [f] add a note     [s] skip
```
Tip: add a shell alias so rating is one key — `alias f='node ~/path/to/agent-router/scripts/feedback.js'` — then just type `f` after a route.

Periodically fold ratings into the reputation scores:
```bash
node scripts/learn.js          # discounted bandit over graded rewards -> ~/.claude/agent-router/learned.json (private)
node scripts/review-logs.js    # summary: most-routed, gaps, ratings
```

## Output contract
Return: (a) the ranked table, (b) the chosen route + why, (c) the result if you
dispatched, or the exact command for the user to run if you did not.

## Notes
- Never recommend a skill/agent you did not actually find in the inventory.
- "Market findings" = the `data/registry.json` scores plus, only if asked, a
  web search for the tool's reputation. Keep it cheap by default.
