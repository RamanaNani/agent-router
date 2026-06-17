#!/usr/bin/env bash
# hina-setup.sh — first-run (and post-update) auto-install of the curated starter pack.
#
# Wired as agent-router's SessionStart hook (hooks/hooks.json, async). When a user installs
# or UPDATES the agent-router plugin, the next session start runs this once and installs the
# curated plugins via the real CLI (`claude plugin install`, driven by hina-bootstrap.js --apply).
#
# Safety / design:
#   - RUN-ONCE per plugin version: a version-stamped marker means it runs on fresh install AND
#     re-runs after an update (so newly-added starter-pack plugins get installed), but not every
#     session.
#   - NON-BLOCKING: the install runs in the background and this script returns immediately, so it
#     never slows session startup. Output goes to a log, never to the hook's stdout (which is
#     JSON-gated — printing CLI output there would corrupt the session).
#   - OPT-OUT: set AGENT_ROUTER_NO_AUTOINSTALL=1 to disable entirely.
#   - SCOPED: hina-bootstrap.js installs only each catalog entry's curated `enable` list — never a
#     whole marketplace — so this can't flood the user with hundreds of plugins.
set -u

DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/agent-router}"
MARKER="$DATA_DIR/.starter-pack-version"
LOG="$DATA_DIR/starter-pack-install.log"
BOOTSTRAP="${CLAUDE_PLUGIN_ROOT:-.}/scripts/hina-bootstrap.js"

# Opt-out.
[ "${AGENT_ROUTER_NO_AUTOINSTALL:-}" = "1" ] && exit 0

# Need node + the bootstrap script.
command -v node >/dev/null 2>&1 || exit 0
[ -f "$BOOTSTRAP" ] || exit 0

mkdir -p "$DATA_DIR" 2>/dev/null || exit 0

# Current plugin version (re-run when it changes = covers updates).
VERSION="$(node -e 'try{process.stdout.write(String(require(process.argv[1]).version||"0"))}catch(e){process.stdout.write("0")}' "${CLAUDE_PLUGIN_ROOT:-.}/.claude-plugin/plugin.json" 2>/dev/null || echo 0)"

# Already done for this version? Skip.
if [ -f "$MARKER" ] && [ "$(cat "$MARKER" 2>/dev/null)" = "$VERSION" ]; then
  exit 0
fi

# Install in the background, log everything, stamp the marker on completion. Detached so session
# startup is never blocked; the hook's own stdout stays empty (clean).
{
  echo "=== agent-router starter-pack auto-install (v$VERSION) $(date -u +%FT%TZ) ==="
  node "$BOOTSTRAP" --apply
  echo "$VERSION" > "$MARKER"
  echo "=== done; run /reload-plugins to activate now ==="
} >>"$LOG" 2>&1 &

exit 0
