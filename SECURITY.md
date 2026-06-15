# Security Policy

## Reporting a vulnerability
Email **ramanareddy1098@outlook.com** with details and reproduction steps. Please do
not open a public issue for security problems. You'll get an acknowledgement, and
credit once it's fixed if you'd like it.

## How agent-router handles your data
agent-router runs locally. It makes no network calls except:
- an optional **daily version check** (`update-check.js` → GitHub `raw` URL), and
- **`/skill-finder`** web/marketplace search, only when you invoke it.

Your data stays on your machine:
- The decision log, learned overlay, and retrieval index live under
  `~/.claude/agent-router/` and are gitignored — never committed or published.
- The npm package ships only the curated `data/registry.json` and
  `data/marketplace.json`. The generated index (`skills-index.json`), which contains
  local file paths, is explicitly excluded from the tarball.

## Execution surface
The scripts run under Node.js and read your installed skill/agent files; they do not
execute arbitrary remote code. If you set the optional `AGENT_ROUTER_EMBED_CMD`
environment variable, `build-index.js` will run that command to produce embeddings —
treat it like any shell command you choose to trust.
