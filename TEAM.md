# The Agent-Router Build Team

This document describes the **self-contained baseline engineering crew** that ships inside the
agent-router plugin. It is the "how a strong team looks and how it works" artifact: the roster, the
philosophy, the lifecycle pipeline, and a full end-to-end walkthrough.

## Philosophy: self-contained baseline, prefer-specialist-when-installed

agent-router is a meta-router. Its job is to discover every installed skill/agent, score them against
a task, and dispatch the best one. But routing is only useful if there is *always something competent
to route to*. So the plugin ships a complete crew that can build anything end to end **even with zero
external plugins installed**.

Two rules govern every member of the crew:

1. **Self-contained baseline.** For every stage of the build lifecycle — requirements, visualization,
   architecture, frontend, backend, data, build-fixing, security, QA, and orchestration — there is a
   baseline agent in `agents/` that can do the job competently on its own. Nothing in the pipeline has
   a hole.
2. **Prefer the specialist when it's installed.** Each baseline agent names the external specialist the
   router should prefer over it when that specialist is present (e.g. the baseline `frontend-engineer`
   yields to `voltagent-lang:react-specialist` for a React app). The baseline is the floor, not the
   ceiling — it guarantees coverage; specialists raise quality when available.

This mirrors the original baseline agents (`code-reviewer`, `debugger`, `researcher`) that shipped
"so there is always a competent reviewer/debugger/explorer to route to." We extend that exact pattern
across the whole build lifecycle.

Every agent embeds the **four mandatory dispatch guardrails** from `skills/agent-router/SKILL.md` §5:
plan before high-risk edits, verify by running (observed not assumed), security is non-negotiable
(any plaintext secret = COMPROMISED → rotate now, never defer), and close with proof
(`## What I did` + `## Final acceptance`).

## The roster

All baseline agents are pinned to `model: sonnet` (the orchestrator runs on `opus`, since planning a
multi-specialist build is the highest-leverage reasoning step). Read-only agents have
`tools: Read, Grep, Glob` (+ `Bash` where they must run commands to observe); builders add
`Write, Edit, Bash`.

| Role | Baseline agent | Mandate | Router prefers when installed | Required skills / competencies |
|---|---|---|---|---|
| **Orchestration** | `delivery-orchestrator` (opus) | Drive a feature end to end: decide which stages are needed, decompose into sub-tasks, return the parallel/sequential dispatch plan for the main agent to run through the router. Does **not** spawn subagents. | (orchestration is native to this plugin — no external preferred) | Task decomposition, dependency analysis, pipeline sequencing, defining the first demoable slice |
| **Requirements** | `requirements-analyst` (sonnet) | Vague ask → testable user stories with acceptance criteria; separate stated vs. inferred; rank the riskiest unknowns. Read-only. | (front-of-pipeline gap — no voice-consistent external preferred) | Requirement discovery, user-story authoring, edge/empty/error/permission/scale coverage, assumption flagging |
| **Visualization / UX** | `ux-visualizer` (sonnet) | Requirements → Mermaid flows + per-screen 5-state specs (default/loading/empty/error/success) + system/sequence diagrams with failure paths. Produces specs, not production code. | (front-of-pipeline gap — no voice-consistent external preferred) | UX flows, wireframing, state modeling, Mermaid, accessibility basics |
| **Architecture** | `solution-architect` (sonnet) | Requirements/visuals → components & boundaries, data model, contract surfaces, failure modes, build order. Read-only blueprint. | `ecc:code-architect` · `ecc:architect` | Component design, data modeling, API/contract design, failure-mode analysis, trade-off reasoning |
| **Frontend** | `frontend-engineer` (sonnet) | Build UI screens with all 5 states against the UX spec; framework-agnostic, detects stack first. | `voltagent-lang:react-specialist` · `voltagent-core-dev:frontend-developer` | Stack detection, component/state implementation, accessibility, dev-server/component-test verification |
| **Backend** | `backend-engineer` (sonnet) | Build APIs, services, business logic to the contract; detects stack; enforce authz at the boundary. | `voltagent-core-dev:backend-developer` · language specialists (`voltagent-lang:python-pro`, etc.) | Stack detection, API/service implementation, input validation, authz, endpoint verification |
| **Data** | `data-engineer` (sonnet) | Schema, reversible up/down migrations, query/index design, RLS. Builder — reviewed by the reviewer role. | `ecc:database-reviewer` · `voltagent-data-ai:postgres-pro` | Schema design, migration tooling, query/index design, row-level security, apply+rollback verification |
| **Build-fixing** | `build-fixer` (sonnet) | Get the build/type-check green with minimal surgical diffs; no architectural edits. | `ecc:build-error-resolver` · `ecc:react-build-resolver` · language `*-build-resolver` | Error reproduction, root-cause-of-build localization, minimal-diff discipline, build verification |
| **Code review** | `code-reviewer` (sonnet, pre-existing) | General correctness/security/clarity review; severity-ranked findings. Read-only. | language `ecc:*-reviewer` (typescript/python/go/…) | Correctness, security, clarity review with `file:line` evidence |
| **Security (ship gate)** | `security-engineer` (sonnet) | Required ship-gate: secrets/injection/authz/OWASP; always enforces immediate secret rotation. Read-only. | `ecc:security-reviewer` · `comprehensive-review:security-auditor` | Secret scanning, injection/authz analysis, OWASP Top 10, rotation enforcement |
| **QA / verification** | `qa-verifier` (sonnet) | Verify by RUNNING real flows/tests; report observed results; write missing tests. | `ecc:e2e-runner` · `ruflo-testgen:tester` · `ecc:tdd-guide` | Test execution, e2e/flow exercise, test authoring, defect reproduction |
| **Debugging** | `debugger` (sonnet, pre-existing) | Reproduce a failure, find the root cause, propose the minimal fix with a verifying command. | `ecc:build-error-resolver` · `ecc:silent-failure-hunter` | Reproduction, stack tracing, one-hypothesis-at-a-time root-causing |
| **Research / exploration** | `researcher` (sonnet, pre-existing) | "How does X work / where is Y / what would it take to change Z" with `file:line` citations. Read-only. | `ecc:code-explorer` | Codebase mapping, execution/data-flow tracing, change-impact analysis |

## The lifecycle pipeline

```
user story
   → requirements-analyst        (clarify: stories, acceptance criteria, assumptions, open Qs)
   → ux-visualizer               (visualize: flows, per-screen 5-state specs, system diagrams)
   → solution-architect          (design: components, data model, contracts, failure modes, build order)
   → [ data-engineer | backend-engineer | frontend-engineer ]   (implement)
   → build-fixer                 (only if the build goes red)
   → code-reviewer + language reviewers   (review)
   → security-engineer           (required ship gate)
   → qa-verifier                 (verify by running the real flow)
   → ship
```

`delivery-orchestrator` sits above this: it decides which stages are actually needed for a given ask,
decomposes the work, and emits the dispatch plan.

### Parallel vs. sequential rule (per SKILL.md §1a)

The router's #1 failure mode is collapsing a multi-part build into a single route. So the orchestrator
**decomposes**, then classifies dependencies:

- **Independent sub-tasks → run in parallel** (multiple Task dispatches in one turn). Example: once the
  data model and contracts are fixed, the frontend screens and the backend endpoints can be built at
  the same time.
- **Dependent sub-tasks → sequence them, and say why** (B needs A's output). Example: architecture must
  precede implementation; implementation must precede QA; a red build routes to `build-fixer` *before*
  review; review and security precede ship.

The orchestrator always shows the decomposition as a short plan first
(`sub-task → chosen specialist (runner-up) → verifier → parallel | after <X>`) so the user sees all N
tasks are covered, then dispatch happens per the plan with one consolidated run summary.

## End-to-end walkthrough: "upload a document and ask questions about it"

A client asks for: *"Let users upload a document and ask questions about it."* Here is how the team
runs it.

**1. Orchestration.** `delivery-orchestrator` restates the definition of done ("a user uploads a file,
it's ingested/indexed, and they get grounded answers with citations to the source") and produces the
dispatch plan below. It flags the high-risk surfaces up front: **file uploads**, **artifact/file
storage**, **citations**, and any **secrets** for the embedding/LLM provider — each carries a
"5-line plan first" instruction.

**2. Requirements** — `requirements-analyst` (read-only, runs first):
- Personas: end user (uploads + asks); success metric: % of questions answered with a correct citation.
- Stories with acceptance criteria, e.g. *"As a user, I want to upload a PDF, so that I can ask about
  its contents"* — covering edges: unsupported file type, oversized file, empty/garbled document,
  upload failure, and asking a question before ingestion finishes.
- Open questions ranked: which file types? max size? who can see whose documents (tenancy)?

**3. Visualization** — `ux-visualizer` (after requirements):
- A Mermaid flow: upload → "indexing…" → ready → ask → answer-with-citation, including the error
  branches (rejected file, ingestion failed, no relevant passage found → graceful empty answer).
- Per-screen 5-state specs for the upload screen and the Q&A screen.
- A sequence diagram: UI → upload API → storage → ingestion/embedding → vector store → query API →
  LLM → cited answer, including timeout and auth-failure paths.

**4. Architecture** — `solution-architect` (after visualization):
- Components: upload handler, storage adapter, ingestion/chunking + embedding worker, vector store,
  retrieval+answer service. Boundaries and contracts for each; data model for documents, chunks,
  embeddings, and per-row ownership (RLS). Failure modes and the build order, with the first demoable
  slice = "upload one file → ask one question → get one cited answer."

**5. Implementation (parallel where independent).** Once the data model and contracts are fixed:
- `data-engineer` (high-risk: migrations + RLS → 5-line plan first) builds the documents/chunks/
  embeddings schema with up/down migrations and per-user RLS; verifies by applying **and rolling back**.
- `backend-engineer` (high-risk: file uploads + secrets → 5-line plan first) builds the upload,
  ingestion, and query endpoints; validates file type/size, enforces authz, keeps provider keys out of
  code; verifies by hitting the endpoints and reporting observed responses.
- `frontend-engineer` builds the upload and Q&A screens with all 5 states; verifies by running the dev
  server and exercising the flow.

  The data schema is a dependency of the backend, so it sequences first; the frontend can proceed in
  parallel against the agreed contract.

**6. Build-fix (only if red).** If the build/types break, `build-fixer` gets it green with minimal
diffs before review — never bundled into a feature commit.

**7. Review + security (ship gates).** `code-reviewer` (and a language reviewer if one is installed)
reviews correctness/clarity. `security-engineer` runs the **required** gate: confirms uploads can't be
abused (path traversal, oversized/zip-bomb, content-type spoofing), authz is enforced per document, and
**no provider secret is in plaintext** — if one is, it demands immediate rotation, never deferral.

**8. QA verification.** `qa-verifier` runs the real flow: uploads an actual document, asks questions,
and confirms the answer cites the right passage — reporting OBSERVED results, plus the edge cases
(unsupported file, empty document, question-before-ready). Defects route back to the implementer.

**9. Ship.** With requirements met, build green, review clean, security passed (and any secret rotated),
and QA verified by running, the feature ships.

### The dispatch plan the orchestrator emits

| Stage / sub-task | Proposed specialist (runner-up) | Verifier | Parallel \| after |
|---|---|---|---|
| Clarify requirements | `requirements-analyst` | self | first |
| Visualize flows/states | `ux-visualizer` | renders | after requirements |
| Design system | `solution-architect` (`ecc:code-architect`) | self | after visualization |
| Schema + RLS migrations (high-risk) | `data-engineer` (`ecc:database-reviewer`) | apply+rollback | after design |
| Upload/ingest/query API (high-risk) | `backend-engineer` (`voltagent-core-dev:backend-developer`) | hit endpoints | after schema |
| Upload + Q&A UI | `frontend-engineer` (`voltagent-lang:react-specialist`) | run dev flow | parallel with backend |
| Fix build if red | `build-fixer` (`ecc:build-error-resolver`) | build green | after implement, if needed |
| Code review | `code-reviewer` (language `ecc:*-reviewer`) | findings | after build green |
| Security ship gate | `security-engineer` (`ecc:security-reviewer`) | findings + rotation | after review |
| Verify by running | `qa-verifier` (`ecc:e2e-runner`) | observed pass | after security |

This is what a strong, self-contained team looks like: every lifecycle stage has an owner, the floor is
guaranteed by baselines, the ceiling is raised by specialists when installed, and the four guardrails
keep the whole pipeline legible, verified, and safe.
