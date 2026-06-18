# Build Pipeline — the enforced engineering flow

This is the canonical, gated flow the team runs for any **multi-step build** (a feature,
a system, an app — not a one-shot task). It is what turns the roster of agents in
`agents/` into an engineering org: defined owners, handoff contracts between stages, and
two **hard quality gates** that cannot be skipped.

Hina (or the main agent) follows this playbook; `delivery-orchestrator` produces the
concrete task-DAG for a specific build. Neither restates the routing math — scoring and
dispatch stay in `skills/agent-router/SKILL.md` (single source of truth).

---

## The one constraint that shapes everything

In Claude Code **a dispatched subagent cannot spawn another subagent, and cannot pause to
ask the user a question.** Therefore the pipeline is **conducted from the main loop** — by
Hina. The orchestrator and every specialist are advisors/workers that *return* results;
Hina is the only actor that can ask you a question and dispatch the next agent. The
"hierarchy" below is real, but it is executed by one conductor, not by agents commanding
agents.

## Hierarchy

```
TIER 0  CONDUCTOR ......... Hina (main loop) — asks the user, dispatches, enforces gates
TIER 1  PLANNER ........... delivery-orchestrator — emits the gated task-DAG
TIER 2  SPECIALISTS:
        Discovery ......... requirements-analyst        (owns cross-questions)
        Design ............ ux-visualizer · solution-architect
        Build ............. frontend-engineer · backend-engineer · data-engineer
        Stabilize ......... build-fixer
        GATE Test ......... qa-verifier                 (HARD GATE)
        GATE Validate ..... code-reviewer · security-engineer   (HARD GATE)
        Support ........... debugger · researcher
```

The router prefers an installed external specialist over a baseline when one exists
(e.g. `voltagent-lang:react-specialist` over `frontend-engineer`); the baselines guarantee
the pipeline runs with zero external plugins.

---

## Stages — owner · input · output · gate

Each stage consumes the previous stage's **handoff artifact** and produces the next one.
The artifact contracts are defined at the bottom.

| # | Stage | Owner | Input | Output artifact | Gate |
|---|-------|-------|-------|-----------------|------|
| 0 | Intake & first clarify | **Hina** | the user's request + memory | a one-line restatement + "clear enough to spec?" | — |
| 1 | Discovery | **requirements-analyst** | the request | **Story Spec** | open questions answered by the user (via Hina) |
| 2 | Plan | **delivery-orchestrator** | Story Spec | **Task DAG** | DAG covers every story; demoable slice named |
| 3 | Design | **ux-visualizer** + **solution-architect** (parallel) | Story Spec + DAG | **Design Spec** | every screen has states; every contract defined |
| 4 | Build | **frontend / backend / data-engineer** (parallel where independent) | Design Spec | **Build Output** (diffs) | code compiles |
| 5 | Stabilize | **build-fixer** | failing build | green build | build/types pass |
| 6 | **TEST (hard gate)** | **qa-verifier** | Build Output + acceptance criteria | **Test Report** | every acceptance criterion observed-passing |
| 7 | **VALIDATE (hard gate)** | **code-reviewer** + **security-engineer** (parallel) | Build Output | **Validation Report** | no unresolved critical/high; security verdict = pass |
| 8 | Ship | **Hina** | all artifacts | consolidated Run summary + real diff + Final acceptance | user accepts |

`debugger` and `researcher` are pulled in on demand (a failing test that isn't an obvious
build error → debugger; an unknown library/API → researcher), not as fixed stages.

---

## The two hard gates (cannot be skipped)

A "hard gate" means: the work is **not done** until the gate passes, and a failing gate
**loops back to build**, it does not get waved through.

**TEST gate (stage 6) — owner `qa-verifier`.**
- Pass criterion: *every* acceptance criterion in the Story Spec is exercised by a real run
  (command, test, or live flow) and **observed** to pass. No criterion may pass on reasoning.
- On fail: Hina routes the failing criteria back to the responsible builder (or `build-fixer`
  / `debugger`), then **re-runs the test gate**. Loop until green or the user calls it.

**VALIDATE gate (stage 7) — owners `code-reviewer` + `security-engineer` (parallel).**
- Pass criterion: zero unresolved **critical** or **high** review findings, AND the security
  verdict is **pass** — no plaintext secrets, authz present on every sensitive path, inputs
  validated.
- Secret rule (non-negotiable): any secret found in plaintext (`.env`, hardcoded token,
  AWS / Anthropic / Supabase JWT key) = **COMPROMISED** → flag for **immediate rotation**,
  never deferred. A security review is **required** for any build touching auth, inputs,
  secrets, storage, or user data.
- On fail: Hina routes the findings back to build, then **re-runs the validate gate**.

Ship (stage 8) happens only after both gates are green.

---

## The clarification seam (who asks the cross-questions)

`requirements-analyst` **owns** cross-questioning — it produces the questions that resolve a
vague story. But a subagent cannot talk to the user. So:

1. `requirements-analyst` returns a Story Spec whose **open questions** are explicit.
2. **Hina relays those questions to the user** (plain text, or `AskUserQuestion` for discrete
   choices), in one batched round where possible.
3. The answers are folded back into the Story Spec before stage 2 begins.

Discovery does not "complete" until the open questions are answered. This is the single most
important seam — it is why discovery is a hard prerequisite, not an optional first step.

---

## Parallel vs. sequential

- **Sequential** (each needs the prior's artifact): Intake → Discovery → Plan → Design → Build.
  Gates (Test, then Validate) are sequential after Build.
- **Parallel** (independent, same turn — multiple Task calls): the two design agents (ux +
  architect); the build agents whose sub-tasks don't share files; the two validate agents
  (review + security). When parallel builders would touch the same files, isolate them in
  worktrees (`isolation: worktree`) to avoid collisions.

---

## Handoff contracts (each artifact's required shape)

- **Story Spec** (requirements-analyst): user stories; **acceptance criteria** as
  Given/When/Then (these become the test gate's checklist); edge cases; **open questions**;
  high-risk surfaces flagged (auth/RLS, migrations, storage, SSE, uploads, secrets).
- **Task DAG** (delivery-orchestrator): a list of build tasks, each
  `{id, owner, inputs, output, depends_on, parallel_group, high_risk}`; the **first demoable
  slice**; the named test + validate gates.
- **Design Spec** (ux-visualizer + solution-architect): per-screen states
  (default/loading/empty/error/success) + flow/sequence diagrams; components, data model,
  API/SSE contracts, failure modes, build order.
- **Build Output** (engineers): the diff per task, mapped back to the acceptance criteria it
  satisfies; a 5-line plan first for any high-risk task.
- **Test Report** (qa-verifier): each acceptance criterion → observed pass/fail + the command
  and its actual output (evidence, not assertion).
- **Validation Report** (code-reviewer + security-engineer): findings by severity with
  `file:line` + fix; security verdict (pass/fail) including the secret scan result.

---

## Walkthrough — "as a user I want to upload a document and ask questions about it"

0. **Hina** restates it, checks memory, judges it a multi-step build → enters this pipeline.
1. **requirements-analyst** → Story Spec: stories (upload, ask, cite); acceptance criteria
   (e.g. *Given a 10-page PDF, When I ask a question, Then I get an answer with a page
   citation*); edges (empty doc, 50 MB file, unsupported type, no-answer-found, unauthorized);
   open Qs (*embedding/LLM provider? max file size? retention?*); high-risk: **upload, storage,
   citations**. → **Hina asks the user** the open Qs, folds answers in.
2. **delivery-orchestrator** → Task DAG: data (schema + RLS), backend (upload/parse/embed +
   SSE chat), frontend (uploader + chat UI); demoable slice = *upload one PDF → ask one
   question → answer with a citation*; gates named.
3. **ux-visualizer** + **solution-architect** (parallel) → Design Spec: uploader/chat states,
   SSE answer-stream sequence diagram; vector store + retrieval/chat API + the SSE contract
   (high-risk → architect states a 5-line plan first).
4. **data-engineer** (RLS → plan first) ‖ **backend-engineer** (upload/SSE → plan first) ‖
   **frontend-engineer** — parallel → Build Output.
5. red build → **build-fixer** → green.
6. **TEST gate — qa-verifier** runs the real upload→ask flow; every acceptance criterion
   observed. Citation criterion fails → back to backend → re-run → green.
7. **VALIDATE gate — code-reviewer** ‖ **security-engineer** (file upload + auth + secrets).
   Any exposed key → rotate now. Pass.
8. **Hina** ships: consolidated Run summary, the real `git diff`, Final acceptance, logs +
   rating.

Stages 0→1→2→3 are sequenced; stage 4's three builders run in one parallel turn; stages
6 then 7 are sequenced gates. This is what "all N tasks visibly covered, tested, and
validated" looks like — not a single route swallowing the request.
