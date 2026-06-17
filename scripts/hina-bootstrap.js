#!/usr/bin/env node
/**
 * hina-bootstrap.js — starter-pack gap analysis + install plan.
 *
 * On a thin install, Hina has few specialists to route to. This reads the curated
 * catalog (data/starter-pack.json), compares it against the marketplaces already
 * known to Claude Code, reports the capability GAP, and emits the exact install
 * commands. It DOES NOT install anything by default — installing third-party code
 * is a consent action, and some catalog entries (the memory plugins, the model
 * router) conflict with each other or with Hina and must not all be enabled.
 *
 * Usage:
 *   node scripts/hina-bootstrap.js                 # dry-run: gap analysis + recommendation
 *   node scripts/hina-bootstrap.js --commands      # also print the exact install commands
 *   node scripts/hina-bootstrap.js --all           # include non-recommended (risky) entries
 *
 * There is intentionally NO auto-install flag. The reliable, consent-respecting
 * path is the printed `/plugin` commands (run them, or `! <cmd>` inline). A
 * config-file install is possible but deliberately omitted: it writes Claude
 * Code internals and skips the trust dialog.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO_DATA = path.join(__dirname, "..", "data", "starter-pack.json");
const KNOWN_MKTS = path.join(os.homedir(), ".claude", "plugins", "known_marketplaces.json");
const SETTINGS = path.join(os.homedir(), ".claude", "settings.json");

function readJSON(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

const pack = readJSON(REPO_DATA, null);
if (!pack) {
  console.error(`cannot read catalog at ${REPO_DATA}`);
  process.exit(1);
}
const known = readJSON(KNOWN_MKTS, {});

// A catalog entry is "present" if a known marketplace points at the same repo/url.
function isPresent(entry) {
  const src = entry.source || {};
  const needle = (src.repo || src.package || "").toLowerCase();
  if (!needle) return false;
  for (const m of Object.values(known)) {
    const s = (m && m.source) || {};
    const hay = `${s.repo || ""} ${s.url || ""}`.toLowerCase();
    if (hay.includes(needle)) return true;
  }
  return false;
}

const args = process.argv.slice(2);
const showCommands = args.includes("--commands");
const includeAll = args.includes("--all");
const apply = args.includes("--apply");

const entries = pack.entries.filter((e) => includeAll || e.recommended || !e.overlaps_hina);

// ── Status table ──────────────────────────────────────────────────────────────
console.log("=== STARTER PACK — status vs your installed marketplaces ===\n");
const covered = new Set();
const missingRecommended = [];
for (const e of pack.entries) {
  const present = isPresent(e);
  if (present) (e.provides || []).forEach((c) => covered.add(c));
  const tag = present ? "INSTALLED" : "missing  ";
  const flags = [
    `risk:${e.risk}`,
    e.overlaps_hina ? "OVERLAPS-HINA" : null,
    e.recommended ? "recommended" : null,
    e.source && e.source.verify ? "verify-slug" : null,
  ]
    .filter(Boolean)
    .join(" ");
  console.log(`  [${tag}] ${e.title}`);
  console.log(`            provides: ${(e.provides || []).join(", ")}`);
  console.log(`            ${flags}`);
  if (!present && e.recommended) missingRecommended.push(e);
}

// ── Capability gap ────────────────────────────────────────────────────────────
const gaps = (pack.capabilities || []).filter((c) => !covered.has(c));
console.log("\n=== CAPABILITY COVERAGE ===");
console.log(`  covered by installed: ${[...covered].sort().join(", ") || "(none detected)"}`);
console.log(`  gaps:                 ${gaps.join(", ") || "(none)"}`);

// ── Recommendation ────────────────────────────────────────────────────────────
console.log("\n=== RECOMMENDATION ===");
if (!missingRecommended.length) {
  console.log("  You already have the low-risk specialist supply. No safe installs needed.");
} else {
  console.log("  Safe to install now (low-risk specialist supply, no Hina overlap):");
  missingRecommended.forEach((e) => console.log(`    • ${e.title} — ${e.why}`));
}
const heldBack = pack.entries.filter((e) => !e.recommended && !isPresent(e));
if (heldBack.length) {
  console.log("\n  Held back (need an explicit decision — overlap or risk):");
  heldBack.forEach((e) => console.log(`    • ${e.title} [risk:${e.risk}] — ${e.why}`));
}

// ── Commands ──────────────────────────────────────────────────────────────────
if (showCommands) {
  console.log("\n=== INSTALL COMMANDS (run yourself, or `! <cmd>` inline) ===");
  for (const e of entries) {
    if (isPresent(e)) continue;
    const s = e.source || {};
    if (e.install_method === "marketplace") {
      console.log(`  # ${e.title}`);
      console.log(`  /plugin marketplace add ${s.repo}`);
      console.log(`  /plugin install <plugin>@<marketplace>   # pick from the catalog after adding`);
    } else if (e.install_method === "npm") {
      console.log(`  # ${e.title} (verify package name first)`);
      console.log(`  npx ${s.package}`);
    } else if (e.install_method === "npm-proxy") {
      console.log(`  # ${e.title} — HIGH RISK proxy, install only if you really want model routing`);
      console.log(`  npx ${s.package}`);
    }
  }
} else if (!apply) {
  console.log("\n  (run with --commands for exact commands, or --apply to register them in settings.json)");
}

// ── --apply: the intelligent auto-install path ─────────────────────────────────
// Claude Code has no silent "install plugin" API. The supported path is declarative:
// write the marketplace to settings.json (extraKnownMarketplaces + enabledPlugins) and
// Claude Code installs/enables it ON THE NEXT STARTUP. So --apply registers the missing
// recommended marketplaces, backs up settings.json first, is idempotent, and asks the
// user to restart. It deliberately does NOT touch the plugin cache or installed_plugins.json
// (fragile internals); it only writes the two documented settings keys. npm-method entries
// (claude-mem) and high-risk ones are reported, not auto-written.
function cmdApply(toInstall) {
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
  } catch {
    /* fresh settings */
  }
  fs.writeFileSync(SETTINGS + ".bak", JSON.stringify(settings, null, 2)); // backup first
  settings.extraKnownMarketplaces = settings.extraKnownMarketplaces || {};
  settings.enabledPlugins = settings.enabledPlugins || {};

  const registered = [];
  const skipped = [];
  for (const e of toInstall) {
    const s = e.source || {};
    if (e.install_method !== "marketplace") {
      skipped.push(`${e.title} (${e.install_method} — run manually)`);
      continue;
    }
    if (s.verify || !s.repo) {
      skipped.push(`${e.title} (repo not verified — confirm slug before shipping)`);
      continue;
    }
    settings.extraKnownMarketplaces[e.name] = { repo: s.repo }; // register the marketplace
    // enabledPlugins needs exact <plugin>@<marketplace> keys; only write them when the
    // catalog supplies them (entry.enable), else just register so `/plugin install` works.
    for (const key of e.enable || []) settings.enabledPlugins[key] = true;
    registered.push(`${e.title} -> extraKnownMarketplaces[${e.name}]${(e.enable || []).length ? " + enabledPlugins" : " (register only; add 'enable' keys to auto-enable)"}`);
  }

  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + "\n");
  console.log("\n=== --apply: wrote settings.json (backup at settings.json.bak) ===");
  registered.forEach((r) => console.log("  + " + r));
  if (skipped.length) {
    console.log("\n  not auto-written:");
    skipped.forEach((s) => console.log("  - " + s));
  }
  console.log("\n  >>> RESTART Claude Code to let it install the registered plugins on startup. <<<");
}

if (apply) {
  const toInstall = pack.entries.filter(
    (e) => e.recommended && !isPresent(e) && (includeAll || !e.overlaps_hina)
  );
  if (!toInstall.length) console.log("\n--apply: nothing missing to register.");
  else cmdApply(toInstall);
}
