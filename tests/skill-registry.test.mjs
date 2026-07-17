// GU5.1 tests — Skill Registry + capability-kit assembly (pure, inert).
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assembleKit,
  getSkill,
  kitAllowsTool,
  listSkills,
  normalizeSkill,
} from '../src/lib/skill-registry.js'
import { TOOL_REGISTRY } from '../src/lib/tool-registry.js'

test('starter library is all read-only and schema-valid', () => {
  const skills = listSkills()
  assert.ok(skills.length >= 4)
  for (const s of skills) {
    assert.equal(s.risk, 'read-only', `${s.id} ships read-only`)
    assert.ok(Object.isFrozen(s))
    for (const t of s.tools) assert.ok(TOOL_REGISTRY[t], `${s.id} tool ${t} is real`)
    // capabilities are derived from tools, never invented
    for (const c of s.capabilities) assert.ok(s.tools.some(t => TOOL_REGISTRY[t].capability === c))
  }
})

test('normalizeSkill drops unknown tools fail-closed and rejects junk', () => {
  assert.equal(normalizeSkill(null), null)
  assert.equal(normalizeSkill({ id: 'BAD ID', purpose: 'x' }), null)
  assert.equal(normalizeSkill({ id: 'ok.skill' }), null)   // no purpose
  const s = normalizeSkill({ id: 'ok.skill', purpose: 'do a thing', tools: ['read_file', 'made_up_tool', 42] })
  assert.deepEqual(s.tools, ['read_file'])                 // junk + unknown dropped
  assert.deepEqual(s.capabilities, ['tools.custom-functions'])
  assert.equal(s.risk, 'read-only')                        // read_file is read-only
})

test('a skill with a write tool is not read-only by default', () => {
  const s = normalizeSkill({ id: 'x.write', purpose: 'p', tools: ['write_file'] })
  assert.equal(s.risk, 'high')
})

test('a skill cannot invent a capability its tools do not carry', () => {
  const s = normalizeSkill({ id: 'x.y', purpose: 'p', tools: ['read_file'], capabilities: ['computer-use', 'mcp.client'] })
  // input capabilities are ignored; derived from tools only
  assert.deepEqual(s.capabilities, ['tools.custom-functions'])
})

test('assembleKit exposes ONLY the skill tools and records what was withheld', () => {
  const kit = assembleKit({ skill: 'research.source-check', requesterId: 'gpt-4o', runId: 'run_1' })
  assert.deepEqual([...kit.tools].sort(), ['fetch_url', 'read_file'])
  // withheld = every other registry tool (least privilege made explicit)
  assert.ok(kit.withheld.includes('run_bash'))
  assert.ok(kit.withheld.includes('write_file'))
  assert.ok(kit.withheld.includes('open_app'))
  assert.equal(kit.skillId, 'research.source-check')
  assert.match(kit.kitId, /^kit_[0-9a-f]{12}$/)
})

test('kit id is deterministic per (skill, requester, run, tools)', () => {
  const a = assembleKit({ skill: 'code.review', requesterId: 'm', runId: 'r' })
  const b = assembleKit({ skill: 'code.review', requesterId: 'm', runId: 'r' })
  const c = assembleKit({ skill: 'code.review', requesterId: 'm', runId: 'r2' })
  assert.equal(a.kitId, b.kitId)
  assert.notEqual(a.kitId, c.kitId)
})

test('no skill / unknown skill → a kit that exposes NOTHING (fail closed)', () => {
  const none = assembleKit({ skill: 'does-not-exist', requesterId: 'm', runId: 'r' })
  assert.deepEqual(none.tools, [])
  assert.equal(none.skillId, null)
  assert.equal(none.withheld.length, Object.keys(TOOL_REGISTRY).length)
  // a worker with this kit may use no tool at all
  assert.equal(kitAllowsTool(none, 'read_file'), false)
})

test('kitAllowsTool gates exactly the skill tools', () => {
  const kit = assembleKit({ skill: 'project.organize', requesterId: 'm', runId: 'r' })
  assert.equal(kitAllowsTool(kit, 'read_file'), true)
  assert.equal(kitAllowsTool(kit, 'write_file'), false)
  assert.equal(kitAllowsTool(kit, 'run_bash'), false)
  assert.equal(kitAllowsTool(null, 'read_file'), false)
})

test('writing.edit is a pure-reasoning skill: zero tools, everything withheld', () => {
  const kit = assembleKit({ skill: 'writing.edit', requesterId: 'm', runId: 'r' })
  assert.deepEqual(kit.tools, [])
  assert.equal(kit.withheld.length, Object.keys(TOOL_REGISTRY).length)
  assert.equal(getSkill('writing.edit').tools.length, 0)
})

// GU5.2 — the least-privilege exposure filter used by worker dispatch. Mirrors
// the server's ctx.allowedTools filtering of SANDBOX_TOOLS.
test('a skill kit is provider-INDEPENDENT — same tools for any model (audit: one skill, ≥3 providers)', () => {
  // assembleKit takes no provider input by design: the same safe research skill
  // yields the same least-privilege kit whether the worker is Claude, GPT, or
  // a local Llama. Only requesterId/runId personalize the id, not the tools.
  const tools = (m) => assembleKit({ skill: 'research.source-check', requesterId: m, runId: 'r' }).tools
  const a = tools('claude-haiku'), b = tools('gpt-4o'), c = tools('ollama-local'), d = tools('gemini-flash')
  assert.deepEqual([...a].sort(), ['fetch_url', 'read_file'])
  assert.deepEqual([...a].sort(), [...b].sort())
  assert.deepEqual([...b].sort(), [...c].sort())
  assert.deepEqual([...c].sort(), [...d].sort())
})

test('no skill can self-grant a tool: kit tools ⊆ the skill\'s declared tools, always', () => {
  for (const s of listSkills()) {
    const kit = assembleKit({ skill: s.id, requesterId: 'm', runId: 'r' })
    for (const t of kit.tools) assert.ok(s.tools.includes(t), `${s.id} kit tool ${t} was declared`)
    // and a hostile manifest can't smuggle a tool it didn't declare
    const hostile = { id: 'evil.skill', purpose: 'p', tools: ['read_file'], grantAll: true, extraTools: ['run_bash'] }
    const k = assembleKit({ skill: hostile, requesterId: 'm', runId: 'r' })
    assert.deepEqual(k.tools, ['read_file'])
  }
})

test('a kit filters a full tool-schema list down to exactly its tools', () => {
  const FULL = [{ function: { name: 'run_bash' } }, { function: { name: 'read_file' } },
    { function: { name: 'write_file' } }, { function: { name: 'fetch_url' } }, { function: { name: 'open_app' } }]
  const kit = assembleKit({ skill: 'research.source-check', requesterId: 'm', runId: 'r' })
  const allow = new Set(kit.tools)
  const filtered = FULL.filter(t => allow.has(t.function.name)).map(t => t.function.name)
  assert.deepEqual(filtered.sort(), ['fetch_url', 'read_file'])
  // no skill selected → the server passes the full list unchanged (pre-skill default)
  const noKit = null
  const unfiltered = noKit ? FULL.filter(t => new Set(noKit.tools).has(t.function.name)) : FULL
  assert.equal(unfiltered.length, 5)
})
