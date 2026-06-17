#!/usr/bin/env bash
# hina-setup.sh — register the upstream marketplaces so agent-router's native plugin
# `dependencies` (declared in .claude-plugin/plugin.json) resolve and install.
#
# WHY this exists: Claude Code auto-installs a plugin's declared `dependencies` at install
# time — BUT "dependencies from a marketplace you have not added are left unresolved", and
# `claude plugin marketplace add` "resolves any outstanding missing dependencies". The curated
# specialists live in OTHER marketplaces (ecc, ruflo, wshobson=claude-code-workflows, VoltAgent),
# which a fresh user hasn't added. So this hook's ONLY job is to add those 4 marketplaces; then
# Claude Code's own resolver installs everything agent-router depends on. The platform does the
# installing — this script just opens the door.
#
# Wired as agent-router's SessionStart hook (hooks/hooks.json, async). Runs once per plugin
# version (re-runs after an update to pick up new dependency marketplaces). Requires Claude
# Code >= 2.1.110 (dependency resolution). After it runs, `/reload-plugins` (or the next
# session) activates the installed specialists.
#
# Safety: run-once-per-version marker; non-blocking (backgrounded); output to a log, never to
# the hook's JSON-gated stdout; opt out with AGENT_ROUTER_NO_AUTOINSTALL=1.
set -u

DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/agent-router}"
MARKER="$DATA_DIR/.starter-pack-version"
LOG="$DATA_DIR/starter-pack-install.log"

# The upstream marketplaces agent-router's dependencies resolve against (repo slugs).
MARKETPLACES="affaan-m/ECC ruvnet/ruflo wshobson/agents VoltAgent/awesome-claude-code-subagents"

[ "${AGENT_ROUTER_NO_AUTOINSTALL:-}" = "1" ] && exit 0
command -v claude >/dev/null 2>&1 || exit 0
mkdir -p "$DATA_DIR" 2>/dev/null || exit 0

# Current plugin version → re-run when it changes (covers updates).
VERSION="$(node -e 'try{process.stdout.write(String(require(process.argv[1]).version||"0"))}catch(e){process.stdout.write("0")}' "${CLAUDE_PLUGIN_ROOT:-.}/.claude-plugin/plugin.json" 2>/dev/null || echo 0)"
if [ -f "$MARKER" ] && [ "$(cat "$MARKER" 2>/dev/null)" = "$VERSION" ]; then
  exit 0
fi

# Register the upstream marketplaces (idempotent). Adding the last one resolves agent-router's
# now-satisfiable dependencies, so Claude Code installs the curated specialists. Backgrounded so
# session startup is never blocked; the hook's own stdout stays empty.
{
  echo "=== agent-router setup (v$VERSION) $(date -u +%FT%TZ): registering upstream marketplaces ==="
  for repo in $MARKETPLACES; do
    echo "--- claude plugin marketplace add $repo ---"
    claude plugin marketplace add "$repo" --scope user 2>&1 || echo "(add failed for $repo — will retry next session)"
  done
  # Non-marketplace tools — CANNOT be plugin dependencies, so install via their own CLIs.
  # OFF by default (each has a real caveat); enable per-tool with an env var:
  #   gstack      = routable skills suite (safe). Set AGENT_ROUTER_INSTALL_GSTACK=1
  #   claude-mem  = OWN session-start memory; CONFLICTS with Hina's memory (use as a backend,
  #                 not alongside). Set AGENT_ROUTER_INSTALL_CLAUDE_MEM=1 only if you accept that.
  #   router      = model proxy (reroutes ALL model calls); used via `ccr code`. Risky.
  #                 Set AGENT_ROUTER_INSTALL_ROUTER=1.
  if [ "${AGENT_ROUTER_INSTALL_GSTACK:-}" = "1" ] && [ ! -d "$HOME/.claude/skills/gstack" ]; then
    echo "--- installing gstack (skills suite) ---"
    git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git "$HOME/.claude/skills/gstack" 2>&1 \
      && ( cd "$HOME/.claude/skills/gstack" && ./setup 2>&1 ) || echo "(gstack install failed)"
  fi
  if [ "${AGENT_ROUTER_INSTALL_CLAUDE_MEM:-}" = "1" ]; then
    echo "--- installing claude-mem (NOTE: runs its own memory — don't also rely on Hina's) ---"
    npx -y claude-mem install 2>&1 || echo "(claude-mem install failed)"
  fi
  if [ "${AGENT_ROUTER_INSTALL_ROUTER:-}" = "1" ]; then
    echo "--- installing claude-code-router (use via: ccr code) ---"
    npm install -g @musistudio/claude-code-router 2>&1 || echo "(router install failed)"
  fi
  echo "$VERSION" > "$MARKER"
  echo "=== done. Claude Code resolves agent-router's dependencies from these marketplaces. Run /reload-plugins to activate. ==="
} >>"$LOG" 2>&1 &

exit 0
