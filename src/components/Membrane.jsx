import { useState } from 'react'

// The Membrane — the SFS Vault shared-intelligence layer between two organisms:
// GOOSE (personal system development · david-fleet · goose-agent-system) and
// SFS STUDIO (studio system development · boris-fleet · sfs-vault).
// Controlled overlap + contribution without diluting either side.

const WORKBENCH_URL = 'http://localhost:8787/'

// Shared orchestration prompts that live in the vault (mirrors the SFS Prompt
// Workbench map). Edit/save happens in the embedded workbench below.
const SHARED_PROMPTS = [
  { name: 'Vault Master Heartbeat', stage: '1 · Sense', status: 'LIVE', file: 'heartbeat-prompt.md' },
  { name: 'Inner-World Model (Studio Memory)', stage: '5 · Model/Memory', status: 'DRAFT', file: 'inner-world-model-prompt.md' },
  { name: 'Cascade / Orchestration Loop', stage: '2–3 · Dispatch+Act', status: 'LIVE', file: 'orchestration-loop.md' },
  { name: 'Daily Domain Synthesis', stage: '2 · Synthesis', status: 'REUSABLE', file: 'daily-synthesis-prompt.md' },
  { name: 'Weekly Strategic Council', stage: '1+2 · Strategy', status: 'REUSABLE', file: 'weekly-council-prompt.md' },
  { name: 'RSI Agent Coach', stage: '5 · Learn', status: 'LIVE', file: 'rsi-agent-coach.md' },
  { name: 'Vault Cleanup Crew', stage: '4–5 · Review', status: 'LIVE', file: 'vault-cleanup-crew-prompt.md' },
  { name: 'Vault Architect (prompt lab)', stage: 'meta · experiments', status: 'UNSCHEDULED', file: 'vault-architect.md' },
]

const STATUS_COLOR = {
  LIVE: 'var(--color-active)',
  DRAFT: 'var(--color-review-text)',
  REUSABLE: 'var(--color-text-2)',
  UNSCHEDULED: 'var(--color-text-3)',
}

export default function Membrane() {
  const [tab, setTab] = useState('map') // 'map' | 'workbench'

  const card = (title, sub, body, accent) => (
    <div style={{
      flex: 1,
      background: 'var(--color-surface)',
      border: '0.5px solid var(--color-border)',
      borderTop: `2px solid ${accent}`,
      borderRadius: 'var(--radius-lg)',
      padding: '14px 16px',
      minWidth: 0,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: accent }}>{title}</div>
      <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 2, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{sub}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-2)', marginTop: 8, lineHeight: 1.5 }}>{body}</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 980 }}>
      {/* Intro */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>The Membrane</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 3, lineHeight: 1.5 }}>
          The SFS Vault shared-intelligence layer — where the personal and studio organisms overlap and
          contribute to each other <em>without diluting either one</em>. Two fleets, one membrane.
        </div>
      </div>

      {/* Two-organism model */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
        {card('GOOSE', 'personal system dev · david-fleet',
          <>Local canon (<code>goose-agent-system</code>). 41 agents, Umbruh, the reviewer octagon. The Director's own organism.</>,
          'var(--color-recursive)')}
        {card('◇ MEMBRANE ◇', 'sfs-vault · shared intelligence',
          <>Shared orchestration prompts, semantic specs, the agents↔domains map. Contribution flows both ways through one gate.</>,
          'var(--color-active)')}
        {card('SFS STUDIO', 'studio system dev · boris-fleet',
          <>The Studio LLC vault (<code>sfs-vault</code>). Boris's organism — orchestration protocols, business domains, the heartbeat.</>,
          'var(--color-dual)')}
      </div>

      {/* Contribution governance */}
      <div style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '14px 16px',
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Controlled overlap — how contribution works without dilution</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.5 }}>
          <div>• <b>Each fleet owns its files</b> — cross-fleet writes are forbidden.</div>
          <div>• <b>The PR is the one door</b> — shared changes go up a <code>david/*</code> branch → merge-gate.</div>
          <div>• <b>Comms are ungated</b> — coordination files need no merge; git is the transport.</div>
          <div>• <b>The octagon gates quality</b> — the 8 reviewers audit anything crossing the membrane.</div>
          <div>• <b>Free zone</b> — <code>members/david/</code> is the Director's drafting area, no PR needed.</div>
          <div>• <b>Boris holds admin</b> — org/canonical authority over the vault is Boris-only.</div>
        </div>
      </div>

      {/* Tab switch */}
      <div style={{ display: 'flex', gap: 6 }}>
        {['map', 'workbench'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'var(--color-recursive)' : 'none',
            color: tab === t ? '#fff' : 'var(--color-text-2)',
            border: '0.5px solid var(--color-border-mid)',
            borderRadius: 'var(--radius)',
            padding: '4px 12px', fontSize: 11, letterSpacing: '0.03em', cursor: 'pointer',
          }}>{t === 'map' ? 'Shared prompts' : 'Prompt Workbench'}</button>
        ))}
        <div style={{ flex: 1 }} />
        <a href={WORKBENCH_URL} target="_blank" rel="noreferrer" style={{
          fontSize: 11, color: 'var(--color-text-3)', textDecoration: 'none', alignSelf: 'center',
        }}>open workbench ↗</a>
      </div>

      {/* Shared prompts map */}
      {tab === 'map' && (
        <div style={{ background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {SHARED_PROMPTS.map((p, i) => (
            <div key={p.file} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px',
              borderTop: i ? '0.5px solid var(--color-border)' : 'none',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{p.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--color-text-3)', marginTop: 1 }}>
                  <code>_system/orchestration/protocol/{p.file}</code> · {p.stage}
                </div>
              </div>
              <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.05em', color: STATUS_COLOR[p.status] || 'var(--color-text-3)' }}>{p.status}</span>
            </div>
          ))}
          <div style={{ padding: '9px 14px', borderTop: '0.5px solid var(--color-border)', fontSize: 10.5, color: 'var(--color-text-3)' }}>
            Read / edit / save these in the Prompt Workbench tab. Many still reference the old Life domains and are being re-shaped to Studio (SFS) domains.
          </div>
        </div>
      )}

      {/* Embedded workbench */}
      {tab === 'workbench' && (
        <div style={{ background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', height: 560 }}>
          <iframe
            src={WORKBENCH_URL}
            title="SFS Prompt Workbench"
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        </div>
      )}
    </div>
  )
}
