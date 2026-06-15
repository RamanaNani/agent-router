#!/usr/bin/env node
/**
 * feedback.js — rate the most recent agent-router route so the bandit can learn.
 *
 * This closes the learning loop. The decision log's rating fields start empty, and
 * learn.js trains on the graded `reward` (or the binary win/loss outcome). Until a
 * route is rated, it teaches the router nothing. This annotates the LAST
 * agent-router row in ~/.claude/agent-router/logs/decisions.jsonl.
 *
 * 4-level rating  ->  reward in [0,1]:
 *     bad = 0.0    ok = 0.34    good = 0.67    excellent = 1.0
 *
 * Two ways to use it:
 *
 *   Interactive (run in a terminal, e.g. alias `f`):
 *     node scripts/feedback.js
 *       shows the last route, then press a key:
 *       [1] bad  [2] ok  [3] good  [4] excellent   [f] add a note   [s] skip
 *
 *   Direct (scriptable / how the /agent-router skill calls it):
 *     node scripts/feedback.js good
 *     node scripts/feedback.js excellent "nailed it"
 *     node scripts/feedback.js bad "should have picked codex"
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const LOG_PATH = path.join(os.homedir(), ".claude", "agent-router", "logs", "decisions.jsonl");

// 4-level scale (+ a few back-compat aliases) -> graded reward in [0,1].
const RATINGS = {
  bad: 0.0, ok: 0.34, okay: 0.34, good: 0.67, excellent: 1.0,
  // aliases kept so older / scripted calls still work:
  great: 1.0, win: 1.0, right: 1.0, loss: 0.0, wrong: 0.0, fail: 0.0,
};
const KEYS = { "1": "bad", "2": "ok", "3": "good", "4": "excellent",
               b: "bad", o: "ok", g: "good", e: "excellent" };

function rewardFor(rating) { return RATINGS[rating]; }
function outcomeFor(reward) { return reward >= 0.5 ? "win" : "loss"; } // back-compat field

function loadLastRoute() {
  if (!fs.existsSync(LOG_PATH)) {
    return { err: `No decision log at ${LOG_PATH}. Route something with /agent-router first.` };
  }
  const lines = fs.readFileSync(LOG_PATH, "utf8").split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].trim()) continue;
    let row;
    try { row = JSON.parse(lines[i]); } catch { continue; }
    if (row.skill === "agent-router") return { lines, idx: i, row };
  }
  return { err: "No agent-router decision found in the log to rate." };
}

function save(lines, idx, row, rating, note) {
  const reward = rewardFor(rating);
  const already = typeof row.reward === "number";
  row.rating = rating;
  row.reward = reward;
  row.outcome = outcomeFor(reward); // keep the binary field for older learn.js
  if (note) row.feedback = note;
  lines[idx] = JSON.stringify(row); // compact, matches how the skill appends rows
  fs.writeFileSync(LOG_PATH, lines.join("\n"));
  console.log(`\n  ${rating.toUpperCase().padEnd(9)} (reward ${reward})  ${row.domain || "?"}/${row.chosen || "?"}${already ? "  (re-rated)" : ""}`);
  console.log(`  task: ${row.task || "(no task)"}`);
  if (note) console.log(`  note: ${note}`);
  console.log(`  -> rated the last route in ${LOG_PATH}`);
  console.log(`     run 'node scripts/learn.js' to fold ratings into data/registry.json\n`);
}

// ── interactive single-keypress prompt ───────────────────────────────────────
function readKey() {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.once("data", (buf) => {
      stdin.setRawMode(false);
      stdin.pause();
      resolve(buf.toString());
    });
  });
}
function readLine(prompt) {
  return new Promise((resolve) => {
    const rl = require("readline").createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (ans) => { rl.close(); resolve(ans.trim()); });
  });
}

async function interactive(lines, idx, row) {
  console.log(`\n  Last route:  ${row.domain || "?"}/${row.chosen || "?"}`);
  console.log(`  task: ${row.task || "(no task)"}`);
  if (row.rating) console.log(`  (already rated: ${row.rating})`);
  let note = row.feedback && row.feedback.trim() ? row.feedback.trim() : "";
  for (;;) {
    process.stdout.write(
      `\n  Rate it:  [1] bad   [2] ok   [3] good   [4] excellent` +
      `\n            [f] add a note   [s] skip\n  > `
    );
    const key = await readKey();
    process.stdout.write("\n");
    if (key === "" || key === "s" || key === "q" || key === "") {
      console.log("  skipped — nothing saved.\n");
      process.exit(0);
    }
    if (key === "f") {
      note = await readLine("  note: ");
      continue; // back to the rating prompt; note is held until you pick 1-4
    }
    const rating = KEYS[key.toLowerCase()];
    if (rating) { save(lines, idx, row, rating, note); process.exit(0); }
    console.log("  (press 1-4, f for a note, or s to skip)");
  }
}

// ── entry ─────────────────────────────────────────────────────────────────────
async function main() {
  const [, , word, ...rest] = process.argv;
  if (word === "-h" || word === "--help") {
    console.log("\n  Usage: node scripts/feedback.js [1-4 | bad|ok|good|excellent] [note]");
    console.log("    1=bad  2=ok  3=good  4=excellent  (also accepts b/o/g/e)");
    console.log("  Or run with no args in a terminal for the interactive rater.\n");
    process.exit(0);
  }

  const loaded = loadLastRoute();
  if (loaded.err) { console.error(`\n  ${loaded.err}\n`); process.exit(1); }
  const { lines, idx, row } = loaded;

  // Direct mode: a rating token was given — number (1-4), letter (b/o/g/e), or word.
  if (word) {
    const tok = word.toLowerCase();
    // numbers + letters resolve via KEYS; words + aliases via RATINGS.
    let canon = KEYS[tok] || null;
    if (!canon && RATINGS[tok] !== undefined) {
      canon = tok === "win" || tok === "great" || tok === "right" ? "excellent"
        : tok === "loss" || tok === "wrong" || tok === "fail" ? "bad"
        : tok === "okay" ? "ok" : tok;
    }
    if (!canon) {
      console.error(`\n  Unknown rating "${word}". Use 1/2/3/4 or bad/ok/good/excellent.\n`);
      process.exit(1);
    }
    save(lines, idx, row, canon, rest.join(" ").trim());
    process.exit(0);
  }

  // No args: interactive only makes sense on a TTY; otherwise it would hang.
  if (!process.stdin.isTTY) {
    console.error("\n  Not a terminal. Pass a rating: node scripts/feedback.js <bad|ok|good|excellent> [note]\n");
    process.exit(1);
  }
  await interactive(lines, idx, row);
}

main();
