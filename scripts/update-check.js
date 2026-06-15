#!/usr/bin/env node
/**
 * update-check.js — tell the user when a newer agent-router is available.
 *
 * Compares the installed version against the latest on GitHub (main branch's
 * package.json), at most once per 24h (cached). Prints ONE line if an update is
 * available, nothing otherwise. Fully non-blocking: any network/parse error is
 * swallowed so it never interrupts routing.
 *
 * Usage:  node scripts/update-check.js          # daily-cached check
 *         node scripts/update-check.js --force   # ignore the cache
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const RUNTIME_DIR = path.join(os.homedir(), ".claude", "agent-router");
const CACHE = path.join(RUNTIME_DIR, ".update-last-check");
const RAW_URL = "https://raw.githubusercontent.com/RamanaNani/agent-router/main/package.json";
const DAY_MS = 24 * 60 * 60 * 1000;

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

// Best-effort local version across install layouts (repo / npx / plugin).
function localVersion() {
  if (process.env.AGENT_ROUTER_VERSION) return process.env.AGENT_ROUTER_VERSION;
  const candidates = [
    path.join(__dirname, "..", "package.json"),
    path.join(os.homedir(), ".claude", "plugins", "marketplaces", "agent-router", "package.json"),
    path.join(os.homedir(), ".claude", "plugins", "marketplaces", "agent-router", ".claude-plugin", "marketplace.json"),
  ];
  for (const c of candidates) {
    const j = readJson(c);
    if (j && j.version) return j.version;
    if (j && Array.isArray(j.plugins) && j.plugins[0] && j.plugins[0].version) return j.plugins[0].version;
  }
  return null;
}

function remoteVersion() {
  try {
    const out = execSync(`curl -fsSL --max-time 5 "${RAW_URL}"`, { encoding: "utf8", timeout: 7000 });
    const j = JSON.parse(out);
    return j && j.version ? j.version : null;
  } catch { return null; }
}

// Returns 1 if a>b, -1 if a<b, 0 if equal — numeric semver compare (ignores pre-release).
function cmp(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

function fresh() {
  try {
    const ts = parseInt(fs.readFileSync(CACHE, "utf8").trim(), 10);
    return Number.isFinite(ts) && Date.now() - ts < DAY_MS;
  } catch { return false; }
}
function stamp() {
  try { fs.mkdirSync(RUNTIME_DIR, { recursive: true }); fs.writeFileSync(CACHE, String(Date.now())); } catch { /* ignore */ }
}

function main() {
  const force = process.argv.includes("--force");
  if (!force && fresh()) return; // checked recently; stay quiet
  stamp();
  const local = localVersion();
  const remote = remoteVersion();
  if (!remote) return; // offline or unreachable — silent
  if (!local) {
    console.log(`  agent-router: latest is v${remote} (couldn't read your installed version).`);
    return;
  }
  if (cmp(remote, local) > 0) {
    console.log(`  agent-router update available: v${local} -> v${remote}`);
    console.log(`  update with:  /plugin marketplace update agent-router   (or: npx claude-agent-router)`);
  }
}

main();
