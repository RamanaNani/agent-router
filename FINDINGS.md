# Research findings — validating the agent-router design

Source: a 104-agent deep-research run (2026-06-07) that fanned out web searches,
fetched 22 sources, extracted 106 claims, and adversarially verified 25 of them
(3 independent skeptics per claim; ≥2 refutes kills it). Below is what survived
(build on it), what was refuted (do **not** assume it), and the design changes implied.

## ✅ Confirmed (high confidence)

### Layer 1 · Retrieval at scale
Hybrid **dense + BM25 fused with Reciprocal Rank Fusion (RRF), then LLM rerank**.
Model tools and their parent agents as graph nodes. **Flat/brute-force under ~10K
vectors; HNSW from ~10K up to 1M.** A smaller embedding model is an adequate,
cost-effective default.
Sources: Agent-as-a-Graph (arXiv 2511.18194), comet (github.com/wizenheimer/comet),
FAISS Hybrid Paradox (arXiv 2506.00049).

### Layer 2 · Learning from feedback
**Contextual bandit over (domain, tool) under bandit feedback**, using **Thompson
Sampling or UCB**. For non-stationarity (tools that degrade/improve over time), use
**discounted or sliding-window Thompson Sampling**. Dueling-bandit variants
(FGTS.CDB) fit when feedback is preference (A-vs-B) rather than absolute reward.
Sources: BaRP "Learning to Route LLMs from Bandit Feedback" (arXiv 2510.07429),
arXiv 2510.00841, PMC11765042.

## ⚠️ Refuted / unverified — do NOT assume

- **"Small embedders consistently BEAT large ones with LLM rerank"** — killed 0-3.
  Use a small embedder for COST, not because it is better. (arXiv 2506.00049)
- **"Unified tool+agent vector space beats agent-first/tool-only by +19.4% Recall@5"**
  — refuted 1-2. Don't over-claim unified/graph retrieval superiority. (arXiv 2511.01854)
- **"Brute-force is faster + less RAM than HNSW under 10K (Qdrant 10K default)"** —
  refuted 1-2. Flat-under-10K is still a fine DEFAULT, but justify it by simplicity
  (no index to build/maintain), not speed.
- **"Discounted/sliding-window TS achieve Õ(T√B_T) regret"** — refuted 1-2. Use the
  technique; don't cite the specific bound.
- **"Reward from BLEU / factual-consistency metrics"** — refuted 1-2. Prefer user
  acceptance + task-success signals over automated text metrics. (arXiv 2505.13355)

## Design changes to incorporate
1. **Retrieval:** combine dense + keyword with **RRF** (not an ad-hoc boost); keep
   Flat <10K → HNSW ≥10K; small embedder as the cost default.
2. **Bandit:** add a **discount factor / sliding window** to the Beta-Bernoulli win/loss
   counts so the router adapts when a tool's quality changes over time.
3. **Reward signal:** base it on **user acceptance / task success**, not BLEU-style metrics.
4. **Orchestration (noted, not independently verified):** "checkpoints ≠ durable
   execution" — for production-grade resume, consider a durable-execution layer, not
   just a plan-file checkpoint. (Diagrid; vadim.blog; Anthropic multi-agent research system)

## Caveats
Only 2 findings reached high confidence after adversarial synthesis. The DAG-orchestration
and observability angles produced primary sources (notably Anthropic's multi-agent research
system write-up) but no top-confidence synthesized claim here — treat Layers 1–2 as
validated and Layers 3–4 as directionally supported but not independently verified.
