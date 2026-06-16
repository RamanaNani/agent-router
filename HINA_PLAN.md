# Hina — Design & Implementation Plan

**Status:** PLAN (pre-build) · Branch: `project_hina` · Last updated: 2026-06-16

> Hina is a conversational personal-assistant layer for Claude Code. You talk to her
> in plain language; she remembers you across sessions, asks before acting when context
> is missing, routes to the right specialist, does the work, and gets better over time.
> **agent-router becomes the routing engine *under* Hina. Hina is the product.**

---

## 1. The decision that shapes everything

**Memory lives in retrieval + live tools, NOT in model weights.** Behaviour/style MAY
live in a small, occasionally-trained LoRA. Reasoning stays with Claude.

This follows the project's own `FINDINGS.md` (hybrid retrieval for memory, bandit for
preference learning) and avoids the fine-tune-as-memory trap: unreliable factual recall,
catastrophic forgetting from daily training, instantly-stale folder snapshots, and a heavy
laptop MLOps pipeline. Facts and context are read live or retrieved; the model is never the
database.

## 2. Architecture (layered)

```
You ──talk──> Hina  (skill `/hina`, runs in the MAIN loop so she can ask questions)
                ├─ reads MEMORY        (~/.claude/agent-router/hina/ — profile + observations)
                ├─ reads LIVE          (folder structure, files, git — on demand, never cached)
                ├─ CLARIFIES           (asks targeted cross-questions when underspecified)
                ├─ asks AGENT-ROUTER   ("best installed tool for this?")      <- existing engine
                ├─ dispatches specialist; gets the Run summary back            <- existing feature
                └─ logs outcome to the REWARD loop (decisions.jsonl + bandit)  <- existing
Optional local SLM: embeddings for retrieval · fast intent/router · style-LoRA — NOT memory.
```

Hina must be a **skill**, not a subagent: dispatched subagents run autonomously and cannot
pause to ask the user anything. The clarify-before-acting behaviour only works in the main loop.

## 3. The memory model (the "DB", done right)

All under `~/.claude/agent-router/hina/` — local, gitignored, inspectable, instant, free:

| File | Holds | Updated |
|------|-------|---------|
| `profile.json` | durable facts: role, domains, stack, response-style prefs, active projects (`path -> one-liner`), liked/disliked tools | on notable events + end-of-session consolidation |
| `observations.jsonl` | append-only log of things Hina notices (raw signal) | every session |
| live filesystem/git | folder structure, file contents, current branch | read on demand, never cached |
| retrieval index (`build-index.js`) | installed skills/agents (later: project docs) | refreshed per session |
| `decisions.jsonl` + `learned.json` | route outcomes + bandit overlay | per route + `learn.js` |

**Update loop:** Hina appends observations during/after work -> a consolidation step distills
`observations.jsonl` -> `profile.json` (and, in v3, into style-LoRA training data). Stale profile
entries (e.g. a project path that no longer exists) are flagged on read, not trusted blindly.

## 4. Scenarios (every path, walked)

1. **Cold start (no profile):** short onboarding — domains, stack, current projects, how you like responses -> write `profile.json`.
2. **Known task, known domain:** read profile -> already has context -> brief confirm -> route -> execute -> consolidated summary -> log.
3. **Ambiguous / underspecified:** detect the gap -> ask targeted cross-questions -> proceed only once clear. (Tune the threshold so it doesn't over-ask.)
4. **New project detected:** notices an unfamiliar repo/dir -> "new project? what is it?" -> add to profile.
5. **Multi-surface task:** route to multiple specialists -> dispatch (worktree-isolate if they'd collide) -> collect Run summaries -> one consolidated report + a `Net:` line.
6. **No installed tool fits:** fall back to `/skill-finder` (marketplace + web + curated).
7. **Cross-session recall:** next day Hina already knows the project from profile + live reads — no re-explaining.
8. **Preference learning:** ratings + corrections feed the bandit and profile (e.g. "prefers terse review", "go-reviewer wins for Go").
9. **Explicit correction:** "that was wrong" -> logged as loss -> profile/learned updated, acknowledged.
10. **Privacy/secrets:** never write secrets/PII to memory; redact; everything stays local + gitignored.
11. **Stale context:** moved/renamed paths caught by live reads; profile self-heals on next consolidation.
12. **Offline / low-resource:** works on Claude + file memory + live reads alone; the SLM is an optional accelerator, never a dependency.

## 5. The local SLM's correct role (only if/when you build one)

- **Embeddings** for retrieval — the natural fit; `build-index.js` already has the
  `AGENT_ROUTER_EMBED_CMD` hook.
- **Fast intent classifier / drafter** to offload cheap decisions from Claude.
- **Style-LoRA** (tone/format mimicry) — trained *weekly-ish on accumulated, eval-gated data*,
  never daily, never for facts.
- **Explicitly NOT** the memory/context store.

## 6. Phased roadmap

**v1 — the wedge (ships fast, pure files + Claude, no SLM):**
`skills/hina/SKILL.md` — `profile.json` memory + clarify-before-acting + route via agent-router
+ execute + Run summary + log to the reward loop. This already feels like Jarvis.

**v2 — depth:** end-of-session consolidation (observations -> profile), retrieval over project
docs, visible preference adaptation (reads `learned.json`), onboarding flow, staleness self-heal.

**v3 — optional local SLM:** embeddings for retrieval + a style-LoRA (periodic, eval-gated).
**Prerequisite: an eval harness** to catch regressions before any weights ship — this is the
keystone `FINDINGS.md` already flagged. No eval, no training.

## 7. Risks & open questions

- **Eval harness is a hard prerequisite for v3.** Don't train anything you can't regression-test.
- **Personality vs noise:** Hina's voice lives in *tone*, not *length*. A chatty persona that pads every reply gets annoying for real work.
- **Clarify threshold:** too many questions is as bad as too few — tune when to ask vs. act.
- **Profile bloat/staleness:** consolidation + staleness checks keep it accurate and small.
- **Scope discipline:** resist "does everything." The product is the four pillars — memory, clarify, route, learn — not infinite capability.
- **Identity/repo framing:** does Hina live in this repo (flagship skill, agent-router as a component) or get its own? Decide before v1 ships publicly.

## 8. Success criteria

- **v1:** over a week, Hina recalls your projects without re-explaining; asks before acting on
  the clearly-ambiguous requests; routes correctly (rated good+); the consolidated summary makes
  multi-agent runs legible at a glance.
- **Memory is inspectable** — open `profile.json` and it's accurate and current.
- **Zero secrets/PII** in memory beyond what's necessary; everything local and gitignored.
- The SLM (if built) measurably speeds up or improves a route — proven against the eval harness,
  not assumed.

## 9. First build step (for the fresh session)

Create `skills/hina/SKILL.md` with: the persona (light, fun, tone-only), the
clarify-before-acting rule, the read-profile -> confirm -> route(agent-router) -> execute ->
consolidated-summary -> log loop, and `hina/profile.json` bootstrapped via the cold-start
onboarding. Pure files + Claude. Ship v1 before touching any model.
