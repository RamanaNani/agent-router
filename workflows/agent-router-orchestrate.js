export const meta = {
  name: 'agent-router-orchestrate',
  description:
    'Plan a goal into a dependency graph, route each subtask to the best installed specialist, run independent subtasks in PARALLEL waves and dependent ones in SEQUENCE, then synthesize. Because it runs as a Workflow, every subtask appears live in /workflows with its own spinner, time taken, and tokens used — exactly like deep-research.',
  phases: [
    { title: 'Plan', detail: 'decompose goal into subtasks + dependencies' },
    { title: 'Route', detail: 'score installed specialists, pick best per subtask' },
    { title: 'Execute', detail: 'dependency-ordered parallel waves + sequential chains' },
    { title: 'Synthesize', detail: 'merge subtask results into the final answer' },
  ],
}

// args may be a plain string goal, or { goal: "..." }
const goal = typeof args === 'string' ? args : args && args.goal ? args.goal : 'No goal provided'

// ── Phase 1 · PLAN — goal → DAG ────────────────────────────────────────────
phase('Plan')
const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    subtasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          task: { type: 'string' },
          domain: { type: 'string' },
          deps: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'task', 'domain', 'deps'],
      },
    },
  },
  required: ['subtasks'],
}
const plan = await agent(
  `Decompose this goal into the smallest useful set of subtasks. Tag each with a short domain ` +
    `(code-review, security, testing, research, design, infra, data, docs, ...) and a list of ` +
    `dependency ids (subtasks that must finish first). Independent subtasks get deps: []. ` +
    `Use short ids like A, B, C.\n\nGOAL:\n${goal}`,
  { label: 'plan', phase: 'Plan', schema: PLAN_SCHEMA },
)
const subtasks = plan.subtasks
log(`Planned ${subtasks.length} subtask(s): ${subtasks.map((s) => s.id).join(', ')}`)

// ── Phase 2 · ROUTE — best installed specialist per subtask ────────────────
phase('Route')
const ROUTE_SCHEMA = {
  type: 'object',
  properties: {
    chosen: { type: 'string' },
    type: { type: 'string', enum: ['agent', 'skill', 'none'] },
    score: { type: 'number' },
    reason: { type: 'string' },
  },
  required: ['chosen', 'type', 'score', 'reason'],
}
const routes = await parallel(
  subtasks.map((st) => () =>
    agent(
      `You are the agent-router. Inventory the skills/subagents available in this session ` +
        `(plus ~/.claude and project .claude) and pick the SINGLE best one for this subtask. ` +
        `Score 0-100 = relevance + specificity + reputation. If nothing scores >= 25, return ` +
        `chosen:"-", type:"none".\n\nSUBTASK (${st.domain}): ${st.task}`,
      { label: `route:${st.id}`, phase: 'Route', schema: ROUTE_SCHEMA },
    ).then((r) => ({ ...st, ...r })),
  ),
)
routes.filter(Boolean).forEach((r) => log(`${r.id} -> ${r.chosen} (${r.score})`))

// ── Phase 3 · EXECUTE — dependency-ordered waves ───────────────────────────
phase('Execute')
const live = routes.filter(Boolean)
const done = new Set()
const results = {}
let guard = 0
while (done.size < live.length && guard++ < 50) {
  const ready = live.filter((r) => !done.has(r.id) && r.deps.every((d) => done.has(d)))
  if (!ready.length) {
    log('Dependency deadlock or all-blocked — stopping execution loop')
    break
  }
  log(`Wave ${guard}: [ ${ready.map((r) => r.id).join(' | ')} ] in parallel`)
  const waveResults = await parallel(
    ready.map((r) => async () => {
      const ctx = r.deps.map((d) => `\n[${d} result]:\n${results[d] || ''}`).join('')
      const prompt = `Do subtask ${r.id} (${r.domain}).\n\nTASK: ${r.task}${ctx}`
      const base = { label: `exec:${r.id} (${r.chosen})`, phase: 'Execute' }
      // ACTUALLY dispatch the chosen specialist subagent when it is a real agent
      // type — Claude Code resolves r.chosen from the same registry as the Agent
      // tool, so the genuine specialist runs here (visible in /workflows).
      if (r.type === 'agent' && r.chosen && r.chosen !== '-') {
        try {
          const out = await agent(prompt, { ...base, agentType: r.chosen })
          return { id: r.id, out }
        } catch (_) {
          // chosen agent type not dispatchable in this session → fall back below.
        }
      }
      // Skills / unknown picks: a generic worker follows the chosen tool's approach
      // (a subagent cannot invoke a /skill the way the main loop can).
      const guide =
        r.type === 'skill' && r.chosen !== '-' ? ` Follow the approach of the "${r.chosen}" skill.` : ''
      const out = await agent(prompt + guide, base)
      return { id: r.id, out }
    }),
  )
  for (const wr of waveResults) if (wr) { results[wr.id] = wr.out; done.add(wr.id) }
  // Anything that errored (null) → record failure, mark done so we don't loop forever.
  for (const r of ready) if (!done.has(r.id)) { results[r.id] = '(failed)'; done.add(r.id) }
}

// ── Phase 4 · SYNTHESIZE ───────────────────────────────────────────────────
phase('Synthesize')
const summary = await agent(
  `Synthesize the final answer to the GOAL from the subtask results below. Be concise and ` +
    `note any subtask that failed.\n\nGOAL: ${goal}\n\nRESULTS:\n` +
    live.map((r) => `- ${r.id} (${r.chosen}): ${results[r.id] || ''}`).join('\n'),
  { label: 'synthesize', phase: 'Synthesize' },
)

return { goal, plan: live, results, summary }
