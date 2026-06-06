#!/usr/bin/env node
/**
 * agent-router installer.
 * Copies this package's `skills/` and `agents/` into the user's ~/.claude/
 * so they become available in Claude Code. Idempotent: re-running overwrites.
 *
 * Usage:  npx agent-router            # install to ~/.claude (user scope)
 *         npx agent-router --project  # install to ./.claude (project scope)
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const projectScope = process.argv.includes("--project");
const root = path.resolve(__dirname, "..");
const dest = projectScope
  ? path.join(process.cwd(), ".claude")
  : path.join(os.homedir(), ".claude");

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dst, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
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

const skills = copyDir(path.join(root, "skills"), path.join(dest, "skills"));
const agents = copyDir(path.join(root, "agents"), path.join(dest, "agents"));

console.log(`\n  agent-router installed to ${dest}`);
console.log(`  - ${skills} skill file(s) -> ${path.join(dest, "skills")}`);
console.log(`  - ${agents} agent file(s) -> ${path.join(dest, "agents")}`);
console.log(`\n  Try it:  /agent-router   (route a task to your best installed tool)`);
console.log(`           /skill-finder  (new here? browse the marketplace by rating)\n`);
