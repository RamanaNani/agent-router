#!/usr/bin/env node
/**
 * build-index.js — build a cheap retrieval index over installed skills/agents.
 *
 * The router uses this to pick top-K candidates instead of reading every
 * skill/agent description on each route. Lexical BM25 by default (zero deps);
 * optional dense embeddings if AGENT_ROUTER_EMBED_CMD is set. The two signals
 * are fused with Reciprocal Rank Fusion (RRF), per FINDINGS.md.
 *
 * Usage:  node scripts/build-index.js                # build/update the index
 *         node scripts/build-index.js --query "..."  # test top-15 retrieval
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const INDEX_PATH = path.join(ROOT, "data", "skills-index.json");

const K1 = 1.5; // BM25 term-saturation
const B = 0.75; // BM25 length-normalization
const RRF_C = 60; // Reciprocal Rank Fusion constant

// ── Inventory ────────────────────────────────────────────────────────────────
function frontmatter(text) {
  // Parse the leading --- ... --- block for name/description (no YAML dep).
  const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    if (key !== "name" && key !== "description") continue;
    out[key] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function addDoc(docs, file, type, source) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch { return; }
  const fm = frontmatter(text);
  if (!fm.name) return;
  docs.push({
    name: fm.name,
    type,
    description: fm.description || "",
    source,
    file,
    hash: crypto.createHash("sha256").update(text).digest("hex").slice(0, 16),
  });
}

function collect() {
  const docs = [];
  for (const base of [path.join(os.homedir(), ".claude"), path.join(process.cwd(), ".claude")]) {
    const skillsDir = path.join(base, "skills");
    if (fs.existsSync(skillsDir)) {
      for (const e of fs.readdirSync(skillsDir, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const file = path.join(skillsDir, e.name, "SKILL.md");
        if (fs.existsSync(file)) addDoc(docs, file, "skill", base);
      }
    }
    const agentsDir = path.join(base, "agents");
    if (fs.existsSync(agentsDir)) {
      for (const e of fs.readdirSync(agentsDir, { withFileTypes: true })) {
        if (e.isFile() && e.name.endsWith(".md")) addDoc(docs, path.join(agentsDir, e.name), "agent", base);
      }
    }
  }
  return docs;
}

// ── Tokenize + BM25 ──────────────────────────────────────────────────────────
function tokenize(s) {
  return (s || "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
}
function termFreq(tokens) {
  const tf = {};
  for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
  return tf;
}

function embed(cmd, text) {
  try {
    const v = JSON.parse(execSync(cmd, { input: text, encoding: "utf8", timeout: 20000 }));
    return Array.isArray(v) ? v : null;
  } catch {
    process.stderr.write("  warn: embed failed for a doc, skipping dense vector\n");
    return null;
  }
}

function buildIndex() {
  const docs = collect();
  const prev = {};
  if (fs.existsSync(INDEX_PATH)) {
    try {
      for (const d of (JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")).docs || [])) prev[d.file] = d;
    } catch { /* ignore corrupt index */ }
  }
  const embedCmd = process.env.AGENT_ROUTER_EMBED_CMD;
  let changed = 0;
  for (const d of docs) {
    const old = prev[d.file];
    if (old && old.hash === d.hash && old.tf) {
      d.tf = old.tf; d.len = old.len;
      if (old.embedding) d.embedding = old.embedding;
      continue;
    }
    changed++;
    const tokens = tokenize(`${d.name} ${d.description}`);
    d.tf = termFreq(tokens);
    d.len = tokens.length;
    if (embedCmd) {
      const v = embed(embedCmd, `${d.name}. ${d.description}`);
      if (v) d.embedding = v;
    }
  }
  const df = {};
  let totalLen = 0;
  for (const d of docs) {
    totalLen += d.len;
    for (const t of Object.keys(d.tf)) df[t] = (df[t] || 0) + 1;
  }
  const index = {
    note: "Retrieval index for agent-router. BM25 lexical + optional dense (RRF-fused).",
    built_at: new Date().toISOString(),
    params: { k1: K1, b: B, rrf_c: RRF_C },
    dense: Boolean(embedCmd),
    N: docs.length,
    avgdl: docs.length ? totalLen / docs.length : 0,
    df,
    docs,
  };
  fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
  return { index, changed };
}

function loadIndex() {
  if (!fs.existsSync(INDEX_PATH)) return null;
  try { return JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")); } catch { return null; }
}

function bm25Rank(index, query) {
  const q = tokenize(query);
  const { df, avgdl, N, docs } = index;
  return docs
    .map((d) => {
      let s = 0;
      for (const t of q) {
        const f = d.tf[t];
        if (!f) continue;
        const idf = Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5));
        s += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + B * (d.len / (avgdl || 1)))));
      }
      return { d, s };
    })
    .sort((a, b) => b.s - a.s)
    .map((x) => x.d);
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function denseRank(index, query) {
  const cmd = process.env.AGENT_ROUTER_EMBED_CMD;
  if (!cmd) return null;
  const withVec = index.docs.filter((d) => d.embedding);
  if (!withVec.length) return null;
  const qv = embed(cmd, query);
  if (!qv) return null;
  return withVec.map((d) => ({ d, s: cosine(qv, d.embedding) })).sort((a, b) => b.s - a.s).map((x) => x.d);
}

function rrf(lists) {
  const score = new Map();
  const byKey = new Map();
  for (const list of lists) {
    list.forEach((d, rank) => {
      const key = `${d.type}:${d.name}`;
      byKey.set(key, d);
      score.set(key, (score.get(key) || 0) + 1 / (RRF_C + rank));
    });
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([key, s]) => ({ ...byKey.get(key), score: s }));
}

function retrieve(query, k = 15) {
  const index = loadIndex();
  if (!index) throw new Error(`No index at ${INDEX_PATH}. Run: node scripts/build-index.js`);
  const lists = [bm25Rank(index, query)];
  const dense = denseRank(index, query);
  if (dense) lists.push(dense);
  return rrf(lists).slice(0, k).map((d) => ({ name: d.name, type: d.type, score: d.score, source: d.source }));
}

module.exports = { retrieve, buildIndex };

// ── CLI ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const qIdx = process.argv.indexOf("--query");
  if (qIdx !== -1) {
    const query = process.argv.slice(qIdx + 1).join(" ");
    const results = retrieve(query, 15);
    console.log(`\n  top ${results.length} for: "${query}"\n`);
    results.forEach((r, i) =>
      console.log(`  ${String(i + 1).padStart(2)}. ${r.score.toFixed(4)}  ${r.type.padEnd(5)} ${r.name}`),
    );
    console.log();
  } else {
    try {
      const { index, changed } = buildIndex();
      console.log(`\n  agent-router index built -> ${INDEX_PATH}`);
      console.log(`  - ${index.N} docs (${changed} re-tokenized)`);
      console.log(`  - ${Object.keys(index.df).length} unique terms`);
      console.log(`  - dense embeddings: ${index.dense ? "ON" : "OFF (set AGENT_ROUTER_EMBED_CMD to enable)"}\n`);
    } catch (err) {
      console.error(`\n  build-index failed: ${err.message}\n`);
      process.exitCode = 1;
    }
  }
}
