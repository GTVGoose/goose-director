// Canonical Tool Registry + broker precondition — Phase 3 of the general-use
// roadmap (GU3), implementing the G8 wiring designed in
// docs/capability-architecture.md §6.
//
// One registry describes every Nexus-hosted tool: stable id, version, the
// capability-registry id it rides, and whether it is read-only. The broker
// precondition is the single decision inserted IN FRONT of the sandbox gate in
// executeTool — an additional AND, never a replacement:
//
//   - config.capabilities.enforced === false (the shipped default): the
//     precondition is a no-op and behavior is byte-identical to T4/T5/T29.
//     FLIPPING it true for real use is Director gate G8 — not code's call.
//   - enforced === true: an ungranted or unknown tool DENIES (fail closed),
//     with an audit-ready reason. A grant only permits the attempt to proceed
//     to the existing sandbox + per-command human-approval gates; it can never
//     bypass them.
//
// Pure module: no fs, no network, no config mutation.

import { createHash } from 'node:crypto'

import { LEGACY_KEY_TO_CAPABILITY, isGranted } from './capability-registry.js'

export const TOOL_REGISTRY = Object.freeze({
  run_bash: Object.freeze({ id: 'run_bash', version: 1, capability: LEGACY_KEY_TO_CAPABILITY.tools, readOnly: false, approval: 'per-action' }),
  read_file: Object.freeze({ id: 'read_file', version: 1, capability: LEGACY_KEY_TO_CAPABILITY.tools, readOnly: true, approval: 'none' }),
  write_file: Object.freeze({ id: 'write_file', version: 1, capability: LEGACY_KEY_TO_CAPABILITY.tools, readOnly: false, approval: 'per-action' }),
  fetch_url: Object.freeze({ id: 'fetch_url', version: 1, capability: LEGACY_KEY_TO_CAPABILITY.tools, readOnly: true, approval: 'none' }),
  open_app: Object.freeze({ id: 'open_app', version: 1, capability: LEGACY_KEY_TO_CAPABILITY.tools, readOnly: false, approval: 'per-action' }),
})

export function getTool(name) {
  return TOOL_REGISTRY[name] || null
}

// GU3.3: normalized result statuses (audit Phase 3 task 6). Every executeTool
// result carries one of these in `status`, additive next to the legacy
// `success` boolean. `success:true` ⟺ status 'success'.
export const TOOL_RESULT_STATUSES = Object.freeze([
  'success',
  'denied',         // policy said no: broker precondition, approval declined/timed out, scope/SSRF block
  'unavailable',    // the subsystem is off (sandbox disabled) or the tool can't run here
  'timeout',        // execution started but hit its time limit
  'provider-error', // an upstream service failed (reserved; provider-hosted lanes use it in Phase 4)
  'malformed',      // the request itself was invalid (unknown tool, bad arguments)
  'cancelled',      // the user cancelled mid-execution (reserved until cancellation lands)
  'error',          // anything else — unexpected execution failure
])

/** The read-only subset — the only tools Phase 3 proposes granting first. */
export function readOnlyTools() {
  return Object.values(TOOL_REGISTRY).filter((t) => t.readOnly).map((t) => t.id)
}

/**
 * Capability-kit identity (GU3.2, audit Phase 3 task 2). Deterministic hash of
 * what a specific model was handed for a specific run: run id + requester +
 * the sorted tool list. Kit ASSEMBLY (choosing the minimal tool set) is Phase
 * 5; this is only the identity that lets audit events and run records
 * cross-reference the exposure.
 */
export function kitIdFor(runId, requesterId, toolNames) {
  const tools = Array.isArray(toolNames) ? [...toolNames].map(String).sort() : []
  const h = createHash('sha256')
    .update(`${String(runId)}|${String(requesterId)}|${tools.join(',')}`)
    .digest('hex')
  return `kit_${h.slice(0, 12)}`
}

/**
 * Broker precondition (T13 §6 / audit Phase 3 task 3). Pure decision:
 *   { allow: true, capabilityId, toolVersion }                    — proceed to sandbox gates
 *   { allow: false, reason, error, capabilityId?, toolVersion? }  — deny, audit `reason`
 *
 * Rules:
 *   - not enforced → allow unconditionally (byte-identical legacy behavior);
 *     capability/version still returned for audit enrichment.
 *   - enforced + unknown tool → deny (fail closed).
 *   - enforced + missing/false grant for the tool's capability → deny.
 *   - the decision reads ONLY (config, toolName, requesterId) — never tool
 *     args, tool output, or web content, so no payload can influence it.
 */
export function brokerPrecondition(config, toolName, requesterId) {
  const tool = getTool(toolName)
  const enforced = config?.capabilities?.enforced === true
  if (!enforced) {
    return { allow: true, capabilityId: tool?.capability || null, toolVersion: tool?.version || null, enforced: false }
  }
  if (!tool) {
    return {
      allow: false, enforced: true, reason: `capability:unknown-tool:${String(toolName).slice(0, 60)}`,
      error: `Unknown tool "${String(toolName).slice(0, 60)}" — not in the Tool Registry.`,
    }
  }
  if (typeof requesterId !== 'string' || !requesterId) {
    return {
      allow: false, enforced: true, capabilityId: tool.capability, toolVersion: tool.version,
      reason: 'capability:no-requester-identity',
      error: 'Tool request carried no requester model identity.',
    }
  }
  if (!isGranted(config, requesterId, tool.capability)) {
    return {
      allow: false, enforced: true, capabilityId: tool.capability, toolVersion: tool.version,
      reason: `capability:${tool.capability}:not-granted:${requesterId.slice(0, 60)}`,
      error: `Model ${requesterId} lacks the ${tool.capability} capability.`,
    }
  }
  return { allow: true, enforced: true, capabilityId: tool.capability, toolVersion: tool.version }
}
