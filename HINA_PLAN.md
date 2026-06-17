# Hina — Design & Implementation Plan

**Status:** v1 COMPLETE · Branch: `project_hina` · Last updated: 2026-06-16

> **v1 ships (pure files + Claude, no SLM):**
> - `skills/hina/SKILL.md` — main-loop assistant: load-memory → clarify → **apply
>   agent-router's routing procedure inline** (single source of truth, no duplication — the
>   sync/dedup fix) → execute → **real git diff** → log once (`--skill hina`) → rate →
>   remember. Plus the persona, session residency + `· hina` marker, cold-start onboarding,
>   and consolidation.
> - **The wedge — visible learning:** `hina-memory.js learned` digest + the route-time
>   **override line** ("routing to X, not the higher-ranked Y, because you rated it…").
> - `scripts/hina-memory.js` — init/show/observe/**log**/**learned** over
>   `~/.claude/agent-router/hina/`, atomic writes, secret screen, 0600 perms.
> - Shared reward loop fixed: `feedback.js`/`learn.js` now train on `skill:"hina"` rows;
>   decision log written via the injection-safe `log` subcommand.
> - Starter-pack catalog (`data/starter-pack.json`) + gap analyzer (`scripts/hina-bootstrap.js`).
>
> **Known v1 caveats:** `skills/hina/SKILL.md` is still gitignored by the `hina/` rule (flip to
> `/hina/` to ship); `verify-slug` entries (gstack, llm-council, claude-mem, router) need real
> sources; bootstrap can't detect skills-dir installs like gstack.
>
> **Deferred to v2:** `events.jsonl` passive-signal capture (so learning doesn't starve on
> ratings), the eval harness (`hina-eval.js`), the optional `--apply` auto-installer,
> end-of-session consolidation trigger, diff-under-worktree handling. **v3:** SLM (style/behavior
> mimicry only, behind the eval harness).

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

---

## 10. Debate-resolved decisions (2026-06-16, 4-reviewer panel + CEO review)

A panel (prosecutor / architect / product / implementer) debated the design. Conclusions:

- **The project lives or dies on the learning loop being real AND felt.** Everything else
  (memory file, clarify, routing) is table stakes or borrowed from agent-router. Unanimous
  conditional verdict: worth building **iff** learning is (a) fed by passive behavioral signal,
  not just optional 1-4 ratings, and (b) surfaced to the user at the moment of divergence.
- **Wedge = personal irreplaceability, not a competitive moat.** "Routes the way I'd route
  after 30 days of watching me." Lead the product on memory x learned-routing; treat
  transparency + clarify as the manners that make it trustworthy.
- **Architecture = hybrid A+C, NOT pure delegation.** Skill-invokes-skill in the main loop is
  model-mediated (can misfire, drop residency, return nothing). So: extract the routing
  procedure into ONE shared file both skills reference (kills drift — the real goal),
  delegation as the happy path, inline-from-shared-file as the guaranteed floor. Do not delete
  Hina's inline routing until the invoke is proven in-harness.
- **Coordination seam (only arises with the refactor):** when Hina routes via agent-router,
  agent-router suppresses its own decision-log + rating prompt; Hina owns one log
  (`--skill hina`) + one prompt. Prevents double rows / double prompts / duplicate training.
- **profile.json vs CLAUDE.md:** CLAUDE.md is harness-global truth (identity, long-term);
  profile.json is Hina's routing/preference working set. On conflict CLAUDE.md wins and Hina
  flags it. They don't compete.
- **Kill criterion (falsifiable):** if within ~2 weeks of real use the learned overlay never
  overrides a BM25 pick, the wedge failed -> ship the reward loop under `/agent-router` and
  retire the Hina wrapper.
- Already fixed in this session: shell-injection in the decision log (now `hina-memory.js log`),
  severed reward loop (`feedback.js`/`learn.js` now accept `skill:"hina"`), non-atomic writes,
  file perms, secret screen on observations (still TODO on `log`).

## 11. New requirements (2026-06-16)

- **Install-time bootstrap (marketplace).** On first `/hina`, check the routable inventory via
  `build-index.js`. If under a minimum threshold, **propose** a curated starter pack
  (code-review, testing, security, docs, debugging) and install it via the marketplace on the
  user's consent (reuse `/skill-finder`, which already ranks uninstalled marketplace plugins).
  Guarantees Hina always has specialists to route to. Propose-then-install; never silent.
- **Behavioral-pattern capture ("Paxel"-style passive signal).** Log behavior events to
  `events.jsonl` — `rating_given`, `diff_kept` (no follow-up edit), `diff_reverted`,
  `agent_rerun`, `explicit_correction`. Map to reward and feed the SAME bandit (`learned.json`),
  so learning does not starve on optional ratings. This is the single most important change to
  make the wedge real.
- **SLM is the later step, and the behavior log is its on-ramp.** `events.jsonl` accumulates the
  exact corpus an SLM would train on to mimic the user's style/decisions. No SLM now; the data
  pipe is laid so the later version is a small, eval-gated step (per §5, §7) — never the memory
  store, only style/behavior mimicry.

## 12. Roadmap (revised, wedge-first)

0. **Free eval** — `scripts/hina-eval.js`: assert dispatched turns surface a real `git diff`;
   assert resident turns carry the `· hina` marker. (Mechanical, no model grading.)
1. **The wedge** — `hina-memory.js learned` digest + the override/consequence lines + behavioral
   capture (`events.jsonl`). Built on today's clean single-log path; no refactor needed yet.
2. **Dedup refactor** — shared routing-procedure file + the log/rate seam fix (hybrid A+C),
   once the wedge proves the project is worth the cleanup.
3. **Install bootstrap** — minimum-skills check + curated starter-pack install via marketplace.
4. **Hygiene** — `looksSecret` on `log`, a concrete consolidation trigger, diff-under-worktree
   (dispatch returns the worktree path).
5. **Defer** — SLM (style/behavior mimicry only, behind the eval harness).
