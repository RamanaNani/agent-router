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

**Locate the scripts once.** Throughout, `<scripts>` is the agent-router scripts
directory. Resolve it to the first that exists: `~/.claude/agent-router/scripts/`
(npx install) · `./scripts/` (this repo) · the installed plugin's own `scripts/`
dir. Use that prefix for every `node <scripts>/*.js` below.

**Mode check (first).** If the invocation is `feedback <bad|ok|good|excellent> [note]`,
skip routing and go straight to step 7 (rate the last route). Otherwise run steps
0-6 to route a task.

### 0. Update check (one line, non-blocking)
Run `node <scripts>/update-check.js` and, if it prints anything, surface that single
line. It's daily-cached and silent when you're current or offline — never let it block routing.

### 1. Capture the task
Restate the user's task in one sentence. Note the domain (code review, research,
testing, design, security, infra, data, etc.) and any constraints (language,
framework, speed vs. depth).

### 1a. Decompose multi-task requests (do NOT collapse to one tool)
If the request bundles **multiple distinct tasks** ("audit X, fix the SSE latency, add inline
citations, find optimizations"), routing the whole thing to a single agent is the #1 failure
mode — it leaves most of the request unaddressed. Instead:
1. Split it into sub-tasks; run steps 2-4 to route **each sub-task to its own best specialist**.
2. Classify dependencies:
   - **Independent** sub-tasks → dispatch in **parallel** (multiple Task calls in one turn).
   - **Dependent** sub-tasks (B needs A's output — e.g. "fix the latency" needs the audit first)
     → **sequence** them, and say why.
3. Show the decomposition as a short plan first — `sub-task → chosen tool → parallel | after <X>`
   — so the user sees **all N tasks are covered**, not just one.
Then dispatch per the plan and give one consolidated Run summary (5a) spanning every sub-task.
A single-tool route is correct only when the request is genuinely one task.

### 2. Inventory via the retrieval index (do NOT read every skill)
You may have **thousands** of installed skills/agents across `~/.claude/skills/`,
`~/.claude/agents/`, and `~/.claude/plugins/` — far too many to read each one, and
eyeballing only the session-list names silently misses whole families (gstack, etc.).
Use the index instead:

```bash
node <scripts>/build-index.js                            # refresh (fast; only re-tokenizes changed files)
node <scripts>/build-index.js --query "<the task text>"  # top ~15 candidates across EVERYTHING installed
```

The index (BM25 + optional dense, RRF-fused) covers top-level skills/agents **and the
full plugins tree**, so gstack/ecc/ruflo are all in scope. Take its top ~15 as your
candidate set, plus any obviously-relevant tool from the session list it missed. For
each, record `name`, `type` (skill|agent), `description`, `source`.

If `build-index.js` is unavailable (plugin-only install without the scripts), fall
back to scanning `~/.claude/skills/*/SKILL.md` + `~/.claude/agents/*.md` + the session
list, and tell the user the index would make the inventory far more complete.

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
- If the top candidate is an **agent** and the user wants it done: dispatch it via the
  Task tool (`subagent_type: <name>`), passing the restated task. **Append this to every
  dispatch prompt** so the work is legible when it returns:
  > End your reply with a `## What I did` section: bullet each file you changed (path +
  > one line on what/why), the commands you ran to verify, the result (pass/fail), and
  > anything you skipped or were unsure about.
- If the top candidate is a **skill**: invoke it via the Skill tool (or tell the user the
  `/command` to run).
- If two candidates are within 5 points, ask the user to choose (show both).
- **Nothing scored ≥ 25 (no installed tool fits)?** Don't stop at "nothing found" —
  automatically run **`/skill-finder`** for this task. It searches the marketplace + web +
  curated catalog for an *uninstalled* specialist and returns ranked options with the exact
  install command. Never invent a tool that doesn't exist.

### 5a. Report what the agent(s) did (consolidated summary)
After any dispatched agent finishes, don't just end the turn — print a clean consolidated
report so the user sees what happened without expanding each subagent transcript:

```
## Run summary
**<agent> — <surface / scope>**  (<N> tool uses)
- Changed: <file> — <what / why>
- Verified: <command> → <pass | fail>
- Skipped / flagged: <anything deferred or uncertain>
```

One block per dispatched agent (pull it from each agent's `## What I did` section). If
agents ran in parallel, show all blocks, then a one-line **Net:** of the combined result
(e.g. "both surfaces compile; secret rotation still on you"). Keep it tight — this is the
at-a-glance view; the full transcript is still one keypress away (`ctrl+o` / the agent panel).

### 5b. Ask for a rating (native-style, one keypress)
Right after routing, close with a single compact line that mirrors Claude Code's own
session-feedback widget — optional, one character, never blocking:

> **Rate this route?**  `1` bad · `2` ok · `3` good · `4` excellent · `0` skip

If the user's next message is a single digit `1`-`4`, record it immediately and learn in the
background (step 7): `node <scripts>/feedback.js <digit>`. `0`, "skip", or anything unrelated =
leave the row unrated and move on. Never re-ask, never block on it. (A skill can't render the
real keypress widget — this one-line digit prompt is the closest equivalent.)

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
new skill to add. Run `node <scripts>/review-logs.js` to summarize the log.

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
routing and record it **instantly, then learn in the background** — the user must never
wait on processing:
```bash
node <scripts>/feedback.js <bad|ok|good|excellent> [note]   # instant: one-line append to the last row
node <scripts>/learn.js >/dev/null 2>&1 &                   # detached: retrain the bandit, do NOT block
```
The first command is a sub-second append. The second folds the rating into `learned.json`
and runs **detached (`&`)**, so confirm the rating in one line ("logged ✓ — good (0.67)") and
let the user go straight to their next task. Never make them wait for the learning step.
(`feedback.js` sets `rating`, `reward`, a back-compat `outcome`, and any note as `feedback` on
the most recent row in `~/.claude/agent-router/logs/decisions.jsonl`.)

**In a plain terminal**, running it with no args opens an interactive rater that shows
the last route and waits for a single keypress:
```
[1] bad   [2] ok   [3] good   [4] excellent     [f] add a note     [s] skip
```
Tip: add a shell alias so rating is one key — `alias f='node ~/.claude/agent-router/scripts/feedback.js'` — then just type `f` after a route.

Periodically fold ratings into the reputation scores:
```bash
node <scripts>/learn.js          # discounted bandit over graded rewards -> ~/.claude/agent-router/learned.json (private)
node <scripts>/review-logs.js    # summary: most-routed, gaps, ratings
```

## Output contract
Return: (a) the ranked table, (b) the chosen route + why, (c) the result if you
dispatched, or the exact command for the user to run if you did not.

## Notes
- Never recommend a skill/agent you did not actually find in the inventory.
- "Market findings" = the `data/registry.json` scores plus, only if asked, a
  web search for the tool's reputation. Keep it cheap by default.
