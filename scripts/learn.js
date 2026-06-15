#!/usr/bin/env node
/**
 * learn.js — discounted Thompson-sampling bandit over (domain, tool).
 *
 * Reads the router's decision log, turns win/loss outcomes into DISCOUNTED
 * Beta-Bernoulli posteriors (recent outcomes weigh more, so the router adapts
 * when a tool's quality drifts — the non-stationary fix from FINDINGS.md), and
 * writes learned reputation scores into data/registry.json without disturbing
 * the curated tools[] list.
 *
 * Usage:  node scripts/learn.js
 * Env:    AGENT_ROUTER_GAMMA  discount factor in (0,1], default 0.95
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

// All PERSONAL/runtime context lives under ONE location: ~/.claude/agent-router/.
// The decision log (feedback) and the learned overlay sit side by side here, so
// nothing personal lands in the repo. The curated data/registry.json in the repo
// stays the shareable baseline and is never written to by learning.
const RUNTIME_DIR = path.join(os.homedir(), ".claude", "agent-router");
const LOG_PATH = path.join(RUNTIME_DIR, "logs", "decisions.jsonl");
const LEARNED_PATH = path.join(RUNTIME_DIR, "learned.json");
const GAMMA = Number(process.env.AGENT_ROUTER_GAMMA || 0.95);

function readRows() {
  if (!fs.existsSync(LOG_PATH)) return [];
  const rows = [];
  for (const line of fs.readFileSync(LOG_PATH, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return rows;
}

// Reward = user acceptance / task success (NOT text metrics — see FINDINGS.md).
// Prefers the graded `reward` in [0,1] from the 4-level rating (bad/ok/good/
// excellent -> 0/0.34/0.67/1). Falls back to the binary win/loss outcome.
function outcomeReward(r) {
  if (typeof r.reward === "number" && r.reward >= 0 && r.reward <= 1) return r.reward;
  if (r.outcome === "win") return 1;
  if (r.outcome === "loss" || r.outcome === "fail") return 0;
  return null; // no signal yet
}

function posteriorMean(alpha, beta) {
  return alpha / (alpha + beta);
}

function learn() {
  const rows = readRows().filter((r) => r.skill === "agent-router" && outcomeReward(r) !== null);
  const arms = {};
  for (const r of rows) {
    const key = `${r.domain || "unknown"} ${r.chosen || "-"}`;
    (arms[key] = arms[key] || []).push(outcomeReward(r));
  }
  const table = [];
  for (const key of Object.keys(arms)) {
    const [domain, tool] = key.split(" ");
    const seq = arms[key]; // chronological (append-only log)
    let dw = 0, dl = 0, wins = 0, losses = 0;
    for (let i = 0; i < seq.length; i++) {
      const w = Math.pow(GAMMA, seq.length - 1 - i); // newest -> gamma^0
      const reward = seq[i]; // graded reward in [0,1]
      dw += w * reward;       // fractional win mass
      dl += w * (1 - reward); // fractional loss mass
      if (reward >= 0.5) wins++; else losses++;
    }
    const alpha = 1 + dw;
    const beta = 1 + dl;
    table.push({ domain, tool, alpha, beta, wins, losses, trials: seq.length, score: Math.round(posteriorMean(alpha, beta) * 100) });
  }
  return table;
}

// Gamma(k,1) via Marsaglia-Tsang; Beta(a,b) = X/(X+Y), X~Gamma(a), Y~Gamma(b).
function normal() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function gammaDraw(k) {
  if (k < 1) return gammaDraw(1 + k) * Math.pow(Math.random(), 1 / k);
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = normal(); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
function sample(alpha, beta) {
  const x = gammaDraw(alpha);
  const y = gammaDraw(beta);
  return x / (x + y);
}

function writeLearned(table) {
  const learned = {};
  for (const a of table) {
    (learned[a.domain] = learned[a.domain] || {})[a.tool] = {
      alpha: Number(a.alpha.toFixed(4)),
      beta: Number(a.beta.toFixed(4)),
      wins: a.wins,
      losses: a.losses,
      trials: a.trials,
      score: a.score,
      updated: new Date().toISOString(),
    };
  }
  const out = {
    _note: "Personal learned reputation overlay for agent-router, derived from your "
      + "decision log. PRIVATE — lives outside the repo, never committed. The skill "
      + "overlays this on top of the curated, shareable data/registry.json at routing time.",
    gamma: GAMMA,
    built_at: new Date().toISOString(),
    learned,
  };
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(LEARNED_PATH, JSON.stringify(out, null, 2));
}

module.exports = { learn, sample, posteriorMean };

// ── CLI ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const table = learn();
  if (!table.length) {
    console.log(`\n  No usable outcomes in ${LOG_PATH}`);
    console.log(`  (rate routes with feedback.js — bad/ok/good/excellent — to train). learned.json unchanged.\n`);
    process.exit(0);
  }
  writeLearned(table);
  table.sort((a, b) => b.score - a.score);
  console.log(`\n  learned ${table.length} (domain,tool) arm(s)  [gamma=${GAMMA}]  -> ${LEARNED_PATH}\n`);
  table.slice(0, 10).forEach((a) =>
    console.log(`    score ${String(a.score).padStart(3)}  ${a.domain}/${a.tool}  (${a.wins}W ${a.losses}L)`),
  );
  console.log();
}
