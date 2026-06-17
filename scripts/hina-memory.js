#!/usr/bin/env node
/**
 * hina-memory.js — the mechanical half of Hina's memory.
 *
 * Hina (skills/hina/SKILL.md) does the reasoning: clarifying, routing, deciding
 * what's worth remembering, and distilling observations into the profile. This
 * script just does the parts that must be atomic and reliable: bootstrapping the
 * store, loading it for context, appending observations, and logging route
 * decisions. Pure Node, no deps.
 *
 * Memory is files, NOT model weights (see HINA_PLAN.md §1). It lives under the
 * same private runtime dir as the rest of agent-router so it's local, gitignored,
 * inspectable, and instant — never committed, never published.
 *
 *   ~/.claude/agent-router/hina/profile.json        durable facts about you
 *   ~/.claude/agent-router/hina/observations.jsonl  append-only raw signal
 *   ~/.claude/agent-router/logs/decisions.jsonl     shared route log (with agent-router)
 *
 * Usage:
 *   node scripts/hina-memory.js init                 # create dir + seed profile (idempotent)
 *   node scripts/hina-memory.js show [--n 8]         # print profile + last N observations
 *   node scripts/hina-memory.js observe <kind> <text> [--project <p>]
 *       kinds: observation | preference | correction | project | fact
 *   node scripts/hina-memory.js log --skill hina --task "..." --domain "..." \
 *       --chosen "..." --chosen-score 87 --runner-up "..." --action dispatched
 *       # appends ONE decision row via JSON.stringify — no shell interpolation,
 *       # so quotes / $() / backticks in the task text can't corrupt JSON or inject.
 *   node scripts/hina-memory.js path                 # print the hina dir (for the skill)
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(os.homedir(), ".claude", "agent-router");
const HINA_DIR = path.join(ROOT, "hina");
const PROFILE_PATH = path.join(HINA_DIR, "profile.json");
const OBS_PATH = path.join(HINA_DIR, "observations.jsonl");
const LOGS_DIR = path.join(ROOT, "logs");
const DECISIONS_PATH = path.join(LOGS_DIR, "decisions.jsonl");
const LEARNED_PATH = path.join(ROOT, "learned.json"); // bandit overlay, written by learn.js

const DIR_MODE = 0o700; // memory is personal — don't let other local users read it
const FILE_MODE = 0o600;
const MAX_SHOW = 500; // clamp --n so a huge file can't flood the context window

const now = () => new Date().toISOString();

// Conservative secret/PII screen so a key glimpsed in a reviewed file never lands
// in memory. Defense-in-depth behind the model's own guardrail — not a guarantee.
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/,                       // OpenAI / Anthropic-style keys
  /ghp_[A-Za-z0-9]{30,}/,                        // GitHub PAT
  /AKIA[0-9A-Z]{16}/,                            // AWS access key id
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,          // PEM private key
  /(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/i,
];
const looksSecret = (text) => SECRET_PATTERNS.some((p) => p.test(text));

// A fresh profile. Identity is the only thing seeded — everything else is filled
// in live by the cold-start onboarding or learned over time. The model is never
// the database; this file is.
function freshProfile() {
  return {
    version: 1,
    created: now(),
    updated: now(),
    identity: { name: "", role: "", email: "" },
    domains: [],          // e.g. ["backend", "agents/LLM tooling"]
    stack: [],            // e.g. ["node", "claude code", "react"]
    response_style: {     // Hina's voice lives in tone, not length
      verbosity: "balanced", // terse | balanced | detailed
      tone: "",
      notes: "",
    },
    projects: {},         // absolute path -> one-line description
    tools: { liked: [], disliked: [] },
    notes: [],            // free-form durable facts that don't fit above
  };
}

function readProfile() {
  try {
    return JSON.parse(fs.readFileSync(PROFILE_PATH, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return null; // genuinely no profile -> cold start
    throw e; // EACCES / EISDIR / parse error: surface it, don't fake cold-start
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE });
}

// Atomic write: never leave a half-written profile if the process dies mid-write.
function writeFileAtomic(file, data) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, data, { mode: FILE_MODE });
  fs.renameSync(tmp, file); // atomic on the same filesystem
}

function cmdInit() {
  ensureDir(HINA_DIR);
  let created = false;
  if (!fs.existsSync(PROFILE_PATH)) {
    writeFileAtomic(PROFILE_PATH, JSON.stringify(freshProfile(), null, 2) + "\n");
    created = true;
  }
  if (!fs.existsSync(OBS_PATH)) fs.writeFileSync(OBS_PATH, "", { mode: FILE_MODE });
  console.log(
    `hina memory ${created ? "initialized" : "already present"} at ${HINA_DIR}\n` +
      `  profile:      ${PROFILE_PATH}\n` +
      `  observations: ${OBS_PATH}` +
      (created ? `\n  next: run the cold-start onboarding to fill in profile.json` : "")
  );
}

function tail(file, n) {
  if (n <= 0) return [];
  let raw = "";
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-n);
}

function cmdShow(n) {
  const profile = readProfile();
  if (!profile) {
    console.log(
      "COLD_START — no profile yet.\n" +
        "Hina should run the cold-start onboarding (HINA_PLAN.md §4.1): ask for\n" +
        "domains, stack, current projects, and preferred response style, then write\n" +
        "profile.json. Run `node scripts/hina-memory.js init` first."
    );
    return;
  }
  console.log("=== PROFILE ===");
  console.log(JSON.stringify(profile, null, 2));
  // Flag stale project paths so Hina trusts live reads over the profile (§4.11).
  // On an unexpected stat error, flag as stale (fail safe: show it, let the user verify).
  const stale = Object.keys(profile.projects || {}).filter((p) => {
    try {
      return !fs.existsSync(p);
    } catch {
      return true;
    }
  });
  if (stale.length) {
    console.log("\n=== STALE (path no longer exists — verify before trusting) ===");
    stale.forEach((p) => console.log("  " + p));
  }
  const obs = tail(OBS_PATH, n);
  console.log(`\n=== RECENT OBSERVATIONS (last ${obs.length}) ===`);
  console.log(obs.length ? obs.join("\n") : "  (none yet)");
}

const KINDS = new Set(["observation", "preference", "correction", "project", "fact"]);

function cmdObserve(kind, text, project) {
  if (!KINDS.has(kind)) {
    console.error(`unknown kind "${kind}". use one of: ${[...KINDS].join(", ")}`);
    process.exit(1);
  }
  if (!text) {
    console.error("nothing to observe (empty text)");
    process.exit(1);
  }
  if (looksSecret(text) || (project && looksSecret(project))) {
    console.error("observation blocked: looks like a secret/credential. Redact, then retry.");
    process.exit(2);
  }
  ensureDir(HINA_DIR);
  const row = { ts: now(), kind, text };
  if (project) row.project = project;
  fs.appendFileSync(OBS_PATH, JSON.stringify(row) + "\n", { mode: FILE_MODE });
  console.log(`observed (${kind}): ${text}`);
}

// Append a route-decision row to the SHARED log, safely. Hina and agent-router both
// write here; feedback.js/learn.js read it. All values arrive as argv and are
// JSON.stringify'd, so no quote/`$()`/backtick in the task text can corrupt the
// line or reach a shell. Replaces the old `echo '{...}' >>` snippet in both SKILLs.
function cmdLog(args) {
  const skill = flag(args, "--skill", "hina");
  const task = flag(args, "--task", "");
  const domain = flag(args, "--domain", "");
  const chosen = flag(args, "--chosen", "");
  const scoreRaw = flag(args, "--chosen-score", "");
  const runnerUp = flag(args, "--runner-up", "-");
  const action = flag(args, "--action", "");
  const score = scoreRaw === "" ? "" : Number(scoreRaw);
  const row = {
    ts: now(),
    skill,
    task,
    domain,
    chosen,
    chosen_score: Number.isFinite(score) ? score : "",
    runner_up: runnerUp,
    action,
    outcome: "",
    feedback: "",
  };
  ensureDir(LOGS_DIR);
  fs.appendFileSync(DECISIONS_PATH, JSON.stringify(row) + "\n", { mode: FILE_MODE });
  console.log(`logged decision: ${skill} -> ${chosen || "(none)"} [${action}]`);
}

// Surface the learned routing overlay so Hina can SAY what she's learned and why
// she overrode a default. This is the visible half of the wedge — a bandit the
// user can't perceive is indistinguishable from no learning.
function cmdLearned(domainFilter) {
  const data = readJSON(LEARNED_PATH);
  const learned = data && data.learned;
  if (!learned || !Object.keys(learned).length) {
    console.log(
      "no learned routing preferences yet — rate routes (feedback.js: bad/ok/good/excellent)\n" +
        "so the overlay can train. Until then, routing uses BM25 + the curated baseline only."
    );
    return;
  }
  console.log("=== LEARNED ROUTING (from your ratings) ===");
  for (const domain of Object.keys(learned).sort()) {
    if (domainFilter && domain !== domainFilter) continue;
    const tools = learned[domain];
    const rows = Object.keys(tools).map((tool) => {
      const t = tools[tool] || {};
      const score =
        typeof t.score === "number"
          ? t.score
          : Math.round((t.alpha / (t.alpha + t.beta)) * 100); // posterior mean
      return { tool, score, wins: t.wins, losses: t.losses, trials: t.trials };
    });
    rows.sort((a, b) => b.score - a.score);
    console.log(`\n  ${domain}:`);
    rows.forEach((r, i) => {
      const wl =
        r.wins != null && r.losses != null ? `  (${r.wins}W ${r.losses}L)` : "";
      const mark = i === 0 ? "→" : " ";
      console.log(`    ${mark} ${r.tool}  score ${r.score}${wl}`);
    });
  }
}

function readJSON(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

// ── arg parsing (tiny) ────────────────────────────────────────────────────────
// existence check, not truthiness: an empty-string value is still "provided".
function flag(args, name, def) {
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : def;
}

function showN(rest) {
  const raw = flag(rest, "--n", "8");
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 8; // reject junk / negatives, allow 0
  return Math.min(n, MAX_SHOW);
}

const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case "init":
    cmdInit();
    break;
  case "show":
    cmdShow(showN(rest));
    break;
  case "observe": {
    const project = flag(rest, "--project", "");
    // kind is the first positional; text is the rest joined (minus the --project pair)
    const positional = [];
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === "--project") {
        i++;
        continue;
      }
      positional.push(rest[i]);
    }
    cmdObserve(positional[0], positional.slice(1).join(" "), project);
    break;
  }
  case "log":
    cmdLog(rest);
    break;
  case "learned":
    cmdLearned(flag(rest, "--domain", ""));
    break;
  case "path":
    console.log(HINA_DIR);
    break;
  default:
    console.log(
      "usage: hina-memory.js <init|show|observe|log|path>\n" +
        "  init                                  bootstrap the store (idempotent)\n" +
        "  show [--n 8]                          print profile + last N observations\n" +
        "  observe <kind> <text> [--project p]   append an observation\n" +
        "  log --skill .. --task .. --domain .. --chosen .. --chosen-score N --runner-up .. --action ..\n" +
        "                                        append a route decision (safe; no shell interpolation)\n" +
        "  learned [--domain X]                  show the learned routing overlay (what Hina has learned)\n" +
        "  path                                  print the hina memory dir"
    );
}
