// Runtime role model — Phase 2 of the general-use roadmap (GU2).
//
// The audit's Finding 8 separation, as data + pure functions:
//
//   | Role            | Responsibility                                  | Model-driven? |
//   |-----------------|--------------------------------------------------|---------------|
//   | local-interface | private conversation, retrieval help, fallback   | yes (local)   |
//   | control-plane   | state, registry, budgets, cancellation, recovery | NO — code     |
//   | brain           | complex planning, delegation, final synthesis    | yes (strong)  |
//   | worker          | bounded specialist assignments                   | yes           |
//   | broker          | validate/authorize/execute/audit tool actions    | NO — code     |
//   | human           | consequential approval, gates, publication       | never a model |
//
// This module is pure and descriptive: it names roles and computes
// deterministic complexity floors. It does not route, grant, or execute.

export const RUN_ROLES = Object.freeze([
  'local-interface',
  'control-plane',
  'brain',
  'worker',
  'broker',
  'human',
])

// SSE turn phases (see POST /api/sandbox) → the role performing that turn.
// 'tool' events are emitted while the deterministic tool funnel executes a
// model's request — the executing party is the broker (code), not the model.
const PHASE_ROLE = Object.freeze({
  plan: 'brain',
  synthesize: 'brain',
  judge: 'brain',
  compose: 'brain',
  propose: 'worker',
  debate: 'worker',
  work: 'worker',
  champion: 'worker',
  challenger: 'worker',
  tool: 'broker',
})

/** Role for a run-trace phase. Fail-closed: unknown phases are 'worker' (least authority among model roles). */
export function roleForPhase(phase) {
  return PHASE_ROLE[phase] || 'worker'
}

// ---------------------------------------------------------------------------
// Deterministic complexity floors (audit Phase 2, task 4)
//
// The floor is a MINIMUM: it can force escalation toward a cloud Brain, never
// force downgrade. The local model may SUGGEST routing; these floors bound it.
// ---------------------------------------------------------------------------

export const COMPLEXITY_FLOORS = Object.freeze([
  'local-ok',            // a local model may plan and synthesize
  'prefer-cloud-brain',  // default to an evaluated cloud Brain; local allowed only by explicit user policy
  'require-cloud-brain', // a cloud Brain (or explicit user local-only override with visible quality warning) is required
])

const FLOOR_RANK = Object.freeze({ 'local-ok': 0, 'prefer-cloud-brain': 1, 'require-cloud-brain': 2 })

/**
 * Deterministic floor from measurable signals. All inputs optional; anything
 * malformed reads as its safe default. Signals (audit list):
 *   sideEffects      — the task will request tools / writes           (boolean)
 *   subtaskCount     — planned or estimated decomposition size        (number)
 *   sourceChars      — volume of source/context material in chars     (number)
 *   needsCurrentInfo — requires up-to-date external research          (boolean)
 *   highStakes       — user marked, or domain-flagged, consequential  (boolean)
 *   contradictions   — conflicting sources must be resolved           (boolean)
 *   artifactComplexity — 'simple' | 'structured' | 'interactive'      (string)
 */
export function complexityFloor(signals) {
  const s = signals && typeof signals === 'object' ? signals : {}
  const subtasks = Number.isFinite(s.subtaskCount) ? s.subtaskCount : 0
  const sourceChars = Number.isFinite(s.sourceChars) ? s.sourceChars : 0
  let rank = 0
  const reasons = []
  const raise = (to, why) => {
    if (to > rank) rank = to
    reasons.push(why)
  }
  if (s.sideEffects === true) raise(1, 'side effects requested (tools)')
  if (subtasks >= 2) raise(1, `${subtasks} subtasks`)
  if (subtasks >= 4) raise(2, 'wide decomposition (4+ subtasks)')
  if (sourceChars > 12000) raise(1, `large source volume (~${Math.round(sourceChars / 1000)}k chars)`)
  if (sourceChars > 48000) raise(2, 'very large source volume — compression fidelity is at risk')
  if (s.needsCurrentInfo === true) raise(1, 'needs current external information')
  if (s.highStakes === true) raise(2, 'high-stakes domain')
  if (s.contradictions === true) raise(2, 'contradiction resolution required')
  if (s.artifactComplexity === 'structured') raise(1, 'structured artifact')
  if (s.artifactComplexity === 'interactive') raise(2, 'interactive artifact')
  return { floor: COMPLEXITY_FLOORS[rank], reasons }
}

/**
 * Escalation pick (GU2.3): the first cloud model from the ensemble that could
 * replace a local Brain when the floor demands cloud. Deterministic — ensemble
 * order decides; returns null when no cloud model exists (caller proceeds
 * local with a visible warning; escalation NEVER refuses the run). Pure.
 */
export function pickEscalationBrain(ensemble, currentBrain) {
  if (!Array.isArray(ensemble)) return null
  if (currentBrain && currentBrain.provider !== 'ollama') return null   // already cloud
  return ensemble.find((m) => m && m.provider && m.provider !== 'ollama') || null
}

/**
 * Whether a Brain choice satisfies a floor. `brain` needs { provider } —
 * anything non-local counts as cloud; localOnlyPolicy=true is the user's
 * explicit choice and satisfies any floor (honesty about quality is the UI's
 * job, refusal is not). Fail-closed: unknown floor requires cloud.
 */
export function brainSatisfiesFloor(brain, floor, localOnlyPolicy = false) {
  if (localOnlyPolicy === true) return true
  const isLocal = !brain || brain.provider === 'ollama'
  const rank = FLOOR_RANK[floor]
  const required = rank === undefined ? 2 : rank
  if (required === 0) return true
  return !isLocal
}
