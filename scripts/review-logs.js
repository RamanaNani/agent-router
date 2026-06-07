#!/usr/bin/env node
/**
 * review-logs.js — summarize agent-router decision logs for internal improvement.
 * Reads ~/.claude/agent-router/logs/decisions.jsonl and prints what to tune.
 *
 * Usage:  node scripts/review-logs.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const logPath = path.join(os.homedir(), ".claude", "agent-router", "logs", "decisions.jsonl");

if (!fs.existsSync(logPath)) {
  console.log(`\n  No log yet at ${logPath}`);
  console.log(`  Use /agent-router or /skill-finder a few times, then re-run.\n`);
  process.exit(0);
}

const rows = [];
for (const line of fs.readFileSync(logPath, "utf8").split("\n")) {
  if (!line.trim()) continue;
  try { rows.push(JSON.parse(line)); } catch { /* skip malformed line */ }
}

const router = rows.filter((r) => r.skill === "agent-router");
const finder = rows.filter((r) => r.skill === "skill-finder");

function tally(arr, key) {
  const m = new Map();
  for (const r of arr) {
    const v = r[key];
    if (!v || v === "-") continue;
    m.set(v, (m.get(v) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

console.log(`\n  agent-router log summary  (${rows.length} decisions)`);
console.log(`  source: ${logPath}\n`);

console.log(`  ROUTING  (${router.length})`);
for (const [n, c] of tally(router, "chosen").slice(0, 10)) {
  console.log(`    ${String(c).padStart(3)}x  ${n}`);
}
const none = router.filter((r) => r.action === "none" || r.chosen === "-");
if (none.length) {
  console.log(`\n    ${none.length} task(s) found NO good installed tool (gaps to fill):`);
  none.slice(0, 10).forEach((r) => console.log(`      - ${r.task || "(no task)"}`));
}
const flagged = router.filter((r) => r.feedback && r.feedback.trim());
if (flagged.length) {
  console.log(`\n    ${flagged.length} flagged as wrong / needs-fix:`);
  flagged.slice(0, 10).forEach((r) => console.log(`      - ${r.chosen}: ${r.feedback}`));
}

console.log(`\n  DISCOVERY  (${finder.length})`);
for (const [n, c] of tally(finder, "domain").slice(0, 10)) {
  console.log(`    ${String(c).padStart(3)}x  ${n}`);
}
const wanted = finder.filter((r) => r.installed === false);
if (wanted.length) {
  console.log(`\n    recommended but NOT installed (roadmap):`);
  wanted.slice(0, 10).forEach((r) => console.log(`      - ${r.recommended || "?"}  (${r.need || ""})`));
}

console.log(`\n  Tune: adjust scores in data/registry.json for over/under-picked tools;`);
console.log(`        build or install for the gaps above.\n`);
