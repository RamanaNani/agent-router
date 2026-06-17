#!/usr/bin/env bash
# hina-setup.sh — register the upstream marketplaces so agent-router's native plugin
# `dependencies` (declared in .claude-plugin/plugin.json) resolve and install.
#
# WHY: Claude Code auto-installs a plugin's declared `dependencies` — but "dependencies from
# a marketplace you have not added are left unresolved", and `claude plugin marketplace add`
# "resolves any outstanding missing dependencies". The curated specialists live in OTHER
# marketplaces a fresh user hasn't added, so this hook's ONLY job is to register those
# marketplaces (idempotent); Claude Code's own resolver then installs the dependencies.
#
# Deliberately minimal + non-breaking (per code review):
#   - registers marketplaces ONLY — no heavy npm/git installs in a session hook (those are
#     documented in the README / handled by the explicit `hina-bootstrap.js`).
#   - run-once-per-version marker, written as soon as the (idempotent, self-healing) adds are
#     attempted, so a transient failure never re-runs the whole thing every session.
#   - guards node + claude; portable date; honors CLAUDE_CONFIG_DIR; opt out with
#     AGENT_ROUTER_NO_AUTOINSTALL=1.
#   - verifies the marketplaces registered and logs loudly if an expected name is missing
#     (marketplace name != repo slug for wshobson -> claude-code-workflows).
set -u

CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$CONFIG_DIR/agent-router}"
MARKER="$DATA_DIR/.starter-pack-version"
LOG="$DATA_DIR/starter-pack-install.log"
KNOWN="$CONFIG_DIR/plugins/known_marketplaces.json"

# repo slug -> expected marketplace name (the name keys agent-router's dependencies).
MARKETPLACES=(
  "affaan-m/ECC=ecc"
  "ruvnet/ruflo=ruflo"
  "wshobson/agents=claude-code-workflows"
  "VoltAgent/awesome-claude-code-subagents=voltagent-subagents"
  "coreyhaines31/marketingskills=marketingskills"
  "thedotmack/claude-mem=thedotmack"
)

[ "${AGENT_ROUTER_NO_AUTOINSTALL:-}" = "1" ] && exit 0
command -v claude >/dev/null 2>&1 || exit 0
command -v node  >/dev/null 2>&1 || exit 0   # version gate needs node; bail cleanly if absent
mkdir -p "$DATA_DIR" 2>/dev/null || exit 0

VERSION="$(node -e 'try{process.stdout.write(String(require(process.argv[1]).version||"0"))}catch(e){process.stdout.write("0")}' "${CLAUDE_PLUGIN_ROOT:-.}/.claude-plugin/plugin.json" 2>/dev/null || echo 0)"
[ "$VERSION" = "0" ] && exit 0   # couldn't read a real version -> don't write a bogus marker
if [ -f "$MARKER" ] && [ "$(cat "$MARKER" 2>/dev/null)" = "$VERSION" ]; then
  exit 0
fi

# Background so session startup is never blocked; the hook's own stdout stays empty.
{
  echo "=== agent-router setup (v$VERSION) $(date -u '+%Y-%m-%dT%H:%M:%SZ'): registering marketplaces ==="
  for entry in "${MARKETPLACES[@]}"; do
    repo="${entry%%=*}"
    echo "--- claude plugin marketplace add $repo ---"
    claude plugin marketplace add "$repo" --scope user 2>&1 || echo "(add failed for $repo — retries next version)"
  done
  # Mark done now: the adds are idempotent and self-healing, so we never want to re-run the
  # whole loop every session just because one add hiccuped.
  echo "$VERSION" > "$MARKER"

  # Verify the expected marketplace NAMES are registered (slug != name for wshobson).
  for entry in "${MARKETPLACES[@]}"; do
    name="${entry##*=}"
    if ! grep -q "\"$name\"" "$KNOWN" 2>/dev/null; then
      echo "WARNING: marketplace '$name' not found in $KNOWN — dependencies from it will not resolve."
    fi
  done
  echo "=== done. Claude Code resolves agent-router's dependencies from these marketplaces. Run /reload-plugins (or restart) to activate. ==="
  echo "Note: non-marketplace tools (gstack / claude-mem / claude-code-router) are NOT installed here — see README; install them explicitly."
} >>"$LOG" 2>&1 &

exit 0
