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
const https = require("https");
const { execSync } = require("child_process");

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
// Read-only fetch of a URL; resolves null on any non-200 / error (best-effort).
function fetchText(url) {
  return new Promise((resolve) => {
    https
      .get(url, { headers: { "User-Agent": "hina-bootstrap" } }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve(body));
      })
      .on("error", () => resolve(null));
  });
}

// Discover a marketplace's canonical name + plugin list from its manifest, so the
// enabledPlugins keys we write are correct (Claude Code installs/enables those on startup).
async function fetchManifest(repo) {
  for (const branch of ["main", "master"]) {
    for (const p of [".claude-plugin/marketplace.json", "marketplace.json"]) {
      const txt = await fetchText(`https://raw.githubusercontent.com/${repo}/${branch}/${p}`);
      if (!txt) continue;
      try {
        const m = JSON.parse(txt);
        if (m && Array.isArray(m.plugins)) return m;
      } catch {
        /* try next path/branch */
      }
    }
  }
  return null;
}

// --apply: actually install via the SUPPORTED non-interactive CLI:
//   claude plugin marketplace add <repo> --scope user
//   claude plugin install <plugin>@<marketplace> --scope user
// (Writing enabledPlugins to settings.json only TOGGLES already-installed plugins — it does
// NOT install — which is why the old settings approach never installed anything.) Installs
// ONLY a curated `enable` list per entry; without one it registers the marketplace and
// reports the count, never bulk-installing dozens-to-hundreds of plugins.
function run(cmd) {
  try {
    execSync(cmd, { stdio: "pipe" });
    return { ok: true };
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || "").toString().trim();
    return { ok: false, err: msg.split("\n").filter(Boolean).pop() || "failed" };
  }
}

async function cmdApply(toInstall) {
  const installed = [];
  const registeredOnly = [];
  const skipped = [];
  // Source of truth for what's ALREADY installed, so we install only the missing plugins.
  let installedSet = new Set();
  try {
    const ip = JSON.parse(
      fs.readFileSync(path.join(os.homedir(), ".claude", "plugins", "installed_plugins.json"), "utf8")
    );
    installedSet = new Set(Object.keys(ip.plugins || {}));
  } catch {
    /* nothing installed yet */
  }
  for (const e of toInstall) {
    const s = e.source || {};
    if (e.install_method !== "marketplace") {
      skipped.push(`${e.title} (${e.install_method} — install manually, e.g. npx)`);
      continue;
    }
    if (s.verify || !s.repo) {
      skipped.push(`${e.title} (repo not verified — confirm slug first)`);
      continue;
    }
    const add = run(`claude plugin marketplace add ${s.repo} --scope user`);
    if (!add.ok) {
      skipped.push(`${e.title}: marketplace add failed (${add.err})`);
      continue;
    }
    const manifest = await fetchManifest(s.repo);
    // Prefer the cross-checked marketplace_name from the catalog (offline, verified) over the
    // live manifest fetch, so a slow/failed network at install time can't break the keys.
    const mktName = e.marketplace_name || (manifest && manifest.name) || e.name;
    const names = (e.enable || []).filter(Boolean); // curated subset ONLY
    if (!names.length) {
      const count = manifest && manifest.plugins ? manifest.plugins.length : "?";
      registeredOnly.push(`${e.title}: marketplace added @${mktName} (${count} plugins available — add an 'enable' list to install specific ones; not bulk-installing)`);
      continue;
    }
    const results = names.map((n) => {
      const key = `${n}@${mktName}`;
      if (installedSet.has(key)) return `• ${n} (already)`; // skip — install only the missing
      const r = run(`claude plugin install ${key} --scope user`);
      return r.ok ? `✓ ${n}` : `✗ ${n} (${r.err})`;
    });
    installed.push(`${e.title} @${mktName}: ${results.join(", ")}`);
  }

  console.log("\n=== --apply: installed via `claude plugin` CLI ===");
  installed.forEach((r) => console.log("  " + r));
  registeredOnly.forEach((r) => console.log("  ~ " + r));
  if (skipped.length) {
    console.log("\n  skipped:");
    skipped.forEach((x) => console.log("  - " + x));
  }
  console.log("\n  Run /reload-plugins to activate now (or they're live next session).");
}

if (apply) {
  // Don't pre-filter by marketplace presence — we want to install MISSING plugins even from
  // already-registered marketplaces. cmdApply skips per-plugin (installedSet) and the CLI
  // marketplace-add is idempotent.
  const toInstall = pack.entries.filter(
    (e) => e.recommended && (includeAll || !e.overlaps_hina)
  );
  if (!toInstall.length) console.log("\n--apply: nothing missing to install.");
  else (async () => { await cmdApply(toInstall); })();
}
