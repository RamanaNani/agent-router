#!/usr/bin/env node
/**
 * agent-router installer.
 * Copies this package's skills/, agents/, data/, and the helper scripts
 * (review-logs.js, learn.js, feedback.js) into the user's ~/.claude/ so the skill
 * (its registry/discovery data + the log/learning tools) works after install.
 * Idempotent: re-running overwrites.
 *
 * Usage:  npx claude-agent-router            # install to ~/.claude (user scope)
 *         npx claude-agent-router --project  # install to ./.claude (project scope)
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const projectScope = process.argv.includes("--project");
const root = path.resolve(__dirname, "..");
const dest = projectScope
  ? path.join(process.cwd(), ".claude")
  : path.join(os.homedir(), ".claude");

// Skip OS/editor junk so we don't pollute ~/.claude (e.g. .DS_Store, .git).
function skip(name) {
  return name.startsWith(".") || name === "node_modules";
}

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dst, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) count += copyDir(s, d);
    else {
      fs.copyFileSync(s, d);
      count++;
    }
  }
  return count;
}

try {
  const skills = copyDir(path.join(root, "skills"), path.join(dest, "skills"));
  const agents = copyDir(path.join(root, "agents"), path.join(dest, "agents"));

  // Registry/discovery data + the log-review tool live under one namespace,
  // alongside the runtime logs the skills write to (~/.claude/agent-router/).
  const home = path.join(dest, "agent-router");
  const data = copyDir(path.join(root, "data"), path.join(home, "data"));
  let scripts = 0;
  const scriptNames = ["review-logs.js", "learn.js", "feedback.js", "build-index.js", "update-check.js", "hina-memory.js", "hina-bootstrap.js"];
  fs.mkdirSync(path.join(home, "scripts"), { recursive: true });
  for (const name of scriptNames) {
    const src = path.join(root, "scripts", name);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(home, "scripts", name));
      scripts++;
    }
  }

  console.log(`\n  agent-router installed to ${dest}`);
  console.log(`  - ${skills} skill file(s)  -> ${path.join(dest, "skills")}`);
  console.log(`  - ${agents} agent file(s)  -> ${path.join(dest, "agents")}`);
  console.log(`  - ${data} data file(s)   -> ${path.join(home, "data")}`);
  console.log(`  - ${scripts} script(s)      -> ${path.join(home, "scripts")}`);
  console.log(`\n  Try it:  /agent-router   (route a task to your best installed tool)`);
  console.log(`           /skill-finder  (new here? browse the marketplace by rating)\n`);
} catch (err) {
  console.error(`\n  agent-router install failed: ${err.message}`);
  if (err.code === "EACCES") {
    console.error(`  Permission denied writing to ${dest}. Try a writable location or fix permissions.`);
  }
  process.exitCode = 1;
}
