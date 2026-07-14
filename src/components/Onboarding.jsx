import { useState, useEffect } from 'react'
import { providerSupports, bulkCloudCapabilityIntents } from '../lib/capabilities.js'

// ── T18b: First-run onboarding & tutorial ────────────────────────────────────
// A full-viewport, stepped welcome flow (implements docs/onboarding-spec.md). It is a
// GUIDED SCREEN, NOT A PRIVILEGE: every capability/consent step writes INERT INTENT only —
// capability preferences (enforcement is gate G8), the broker config in its disabled object
// form (enabling is gate G9), and the sandbox opt-in (G3, already approved off-by-default).
// Finishing turns nothing on that isn't gated elsewhere.
//
// Gate (in App.jsx): show iff `ui.onboarding !== false && ui.onboardingComplete !== true`.
// `ui.onboarding` uniquely defaults ON-when-absent (a fresh install greets the buyer); the C
// lineage / dev builds set it false. Finish OR skip sets `ui.onboardingComplete:true` so it
// never reappears. All writes go through the EXISTING /api/config normalizers — no new path.

const VAULT_LABELS = {
  goose: 'Registry-style agent repo',
  sfs: 'SFS-style studio vault',
  generic: 'Generic vault',
}

// Feature tour (Path A) and learning track (Path B) share the capability step + recap.
const TOUR_STEPS = ['vault', 'brain', 'models', 'capability', 'recap']
const LEARN_STEPS = ['l_concept', 'l_memory', 'l_repo', 'l_registry', 'l_directing', 'capability', 'recap']

export default function Onboarding({ health, refresh }) {
  const [page, setPage] = useState('welcome')     // welcome | paths | track | skipConfirm
  const [track, setTrack] = useState(null)          // 'tour' | 'learn'
  const [step, setStep] = useState(0)               // index into the active step list
  const [busy, setBusy] = useState(false)

  // Capability-step choices (applied when advancing to recap; INTENT ONLY)
  const [models, setModels] = useState([])
  const [bulkCaps, setBulkCaps] = useState(false)   // "enable tools+MCP for all cloud models"
  const [sandboxOptIn, setSandboxOptIn] = useState(false)   // the ONE live toggle (G3-safe)
  const [sandboxTouched, setSandboxTouched] = useState(false)   // did the user actually flip it?
  const [applyMsg, setApplyMsg] = useState(null)

  useEffect(() => {
    fetch('/api/models').then(r => r.json()).then(d => setModels(d.models || [])).catch(() => {})
    // Seed the sandbox opt-in from the CURRENT config so replaying onboarding (Settings → Replay)
    // reflects an existing choice and can never silently flip it. sandboxTouched stays false until
    // the user actually toggles — so a replay that just clicks Next writes nothing to the sandbox.
    fetch('/api/config').then(r => r.json()).then(cfg => { if (cfg.sandbox?.enabled) setSandboxOptIn(true) }).catch(() => {})
  }, [])

  const toggleSandbox = () => { setSandboxTouched(true); setSandboxOptIn(v => !v) }

  const steps = track === 'tour' ? TOUR_STEPS : track === 'learn' ? LEARN_STEPS : []
  const stepKey = steps[step]

  // Mark the flow finished (finish OR skip). Persists the userData marker, then refreshes App —
  // the gate closes and the user drops into the console (or the existing <Setup> if no repo).
  const markComplete = async () => {
    setBusy(true)
    try {
      await fetch('/api/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ui: { onboardingComplete: true } }),
      })
    } catch (e) { /* fail-soft: a transient save error is swallowed; refresh() re-renders and
                     the user can retry. A durable failure re-shows the flow (the marker never
                     persisted) rather than white-screening — a soft re-loop, not a hard trap. */ }
    setBusy(false)
    refresh()
  }

  // Apply the capability-step choices as INTENT — MINIMAL WRITE. We persist ONLY what the user
  // actually changed, so replaying onboarding (Settings → Replay) can never silently disable an
  // existing sandbox or wipe a configured broker:
  //  • capabilities → written only if the user flipped the bulk switch (enforced:false, intent only).
  //  • sandbox.enabled → written only if the user actually toggled it (seeded from current config).
  //  • sandbox.autoApprove → NEVER written here. An empty disabled broker object has no functional
  //    value (enabling an empty allowlist auto-grants nothing — that's gate G9's job), and writing
  //    it is the ONLY way onboarding could clobber a user's broker rules. Omitting the key lets the
  //    server's validateAutoApprove(undefined, prior) preserve any existing broker verbatim. The
  //    broker is surfaced as an explainer; configuring it lives in Settings/G9.
  const applyCapabilityIntents = async () => {
    setApplyMsg(null)
    const body = {}
    if (sandboxTouched) body.sandbox = { enabled: sandboxOptIn }   // the one live opt-in
    if (bulkCaps) body.capabilities = { enforced: false, models: bulkCloudCapabilityIntents(models) }
    if (Object.keys(body).length === 0) return   // user changed nothing → write nothing
    try {
      const res = await fetch('/api/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.ok) setApplyMsg({ ok: false, text: data.error || 'Could not save preferences' })
    } catch (e) { setApplyMsg({ ok: false, text: e.message }) }
  }

  // Advance. Leaving the capability step applies the intents first (fail-soft — a save error
  // surfaces but never blocks progress, so no one is trapped).
  const next = async () => {
    if (stepKey === 'capability') await applyCapabilityIntents()
    if (step < steps.length - 1) setStep(step + 1)
  }
  const back = () => { if (step > 0) setStep(step - 1) }

  // ── shared styles ──────────────────────────────────────────────────────────
  const overlay = {
    position: 'fixed', inset: 0, zIndex: 50, background: 'var(--color-bg)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  }
  const card = {
    width: 640, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto',
    background: 'var(--color-surface)', border: '0.5px solid var(--color-border-mid)',
    borderRadius: 'var(--radius-lg)', padding: '34px 40px', animation: 'fade-in 0.2s ease-out',
  }
  const primaryBtn = (disabled) => ({
    background: disabled ? 'var(--color-surface-3)' : 'var(--color-recursive-bg)',
    border: `0.5px solid ${disabled ? 'var(--color-border-mid)' : 'var(--color-recursive-border)'}`,
    color: disabled ? 'var(--color-text-3)' : 'var(--color-recursive-text)',
    borderRadius: 'var(--radius)', padding: '9px 20px', fontSize: 13, fontWeight: 600,
    letterSpacing: '0.02em', cursor: disabled ? 'not-allowed' : 'pointer',
  })
  const ghostBtn = {
    background: 'none', border: '0.5px solid var(--color-border-mid)', color: 'var(--color-text-2)',
    borderRadius: 'var(--radius)', padding: '9px 16px', fontSize: 12.5, cursor: 'pointer',
  }
  const skipCorner = {
    position: 'absolute', top: 18, right: 22, background: 'none', border: 'none',
    color: 'var(--color-text-3)', fontSize: 11.5, cursor: 'pointer', letterSpacing: '0.02em',
    WebkitAppRegion: 'no-drag',
  }

  // ── welcome ──────────────────────────────────────────────────────────────
  if (page === 'welcome') {
    return (
      <div style={overlay}>
        <button style={skipCorner} onClick={() => setPage('skipConfirm')}>Skip</button>
        <div style={card}>
          <div style={{ fontSize: 12, letterSpacing: '0.14em', color: 'var(--color-text-3)', fontWeight: 600 }}>NEXUS</div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 14 }}>Welcome to Nexus.</div>
          <div style={{ fontSize: 14, color: 'var(--color-text-2)', marginTop: 14, lineHeight: 1.7, maxWidth: 480 }}>
            One brain, many minds — point Nexus at your vault and direct a council of AI models to
            actually get work done.
          </div>
          <div style={{ marginTop: 30 }}>
            <button style={primaryBtn(false)} onClick={() => setPage('paths')}>Get started →</button>
          </div>
        </div>
      </div>
    )
  }

  // ── path chooser ───────────────────────────────────────────────────────────
  if (page === 'paths') {
    const startTrack = (t) => { setTrack(t); setStep(0); setPage('track') }
    const pathCard = (onClick, title, body) => (
      <button onClick={onClick} style={{
        textAlign: 'left', flex: 1, minWidth: 240,
        background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border-mid)',
        borderRadius: 'var(--radius-lg)', padding: '20px 22px', cursor: 'pointer',
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 8, lineHeight: 1.6 }}>{body}</div>
      </button>
    )
    return (
      <div style={overlay}>
        <button style={skipCorner} onClick={() => setPage('skipConfirm')}>Skip</button>
        <div style={card}>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>How would you like to start?</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 22, flexWrap: 'wrap' }}>
            {pathCard(() => startTrack('tour'),
              'Run me through Nexus’s features & capabilities.',
              'A short guided tour of what Nexus does — the vault, the council of models, cost, and how to set up advanced capabilities.')}
            {pathCard(() => startTrack('learn'),
              'I’m new to this — teach me to build an agentic system.',
              'A concept-first track: the memory layer, the vault/repo, the agent registry, and directing a council — using Nexus as the worked example.')}
          </div>
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <button style={{ ...ghostBtn, border: 'none', color: 'var(--color-text-3)' }} onClick={() => setPage('skipConfirm')}>
              Skip — I know my way around
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── skip confirm ─────────────────────────────────────────────────────────
  if (page === 'skipConfirm') {
    return (
      <div style={overlay}>
        <div style={card}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Skip onboarding?</div>
          <div style={{ fontSize: 12.5, color: 'var(--color-text-2)', marginTop: 12, lineHeight: 1.7 }}>
            You can revisit this anytime from <strong style={{ color: 'var(--color-text)' }}>Settings → Onboarding</strong>.
            Nothing was enabled — advanced capabilities stay off until you turn them on in Settings.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            <button style={primaryBtn(busy)} disabled={busy} onClick={markComplete}>
              {busy ? 'Skipping…' : 'Skip to Nexus →'}
            </button>
            <button style={ghostBtn} onClick={() => setPage('paths')}>Back</button>
          </div>
        </div>
      </div>
    )
  }

  // ── track (tour / learn): header + per-step body + footer ────────────────────
  return (
    <div style={overlay}>
      <button style={skipCorner} onClick={() => setPage('skipConfirm')}>Skip</button>
      <div style={card}>
        {/* progress dots */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 22 }}>
          {steps.map((_, i) => (
            <span key={i} style={{
              width: i === step ? 18 : 6, height: 6, borderRadius: 'var(--radius-pill)',
              background: i <= step ? 'var(--color-recursive-border)' : 'var(--color-border-mid)',
              transition: 'width 0.2s',
            }} />
          ))}
        </div>

        <StepBody
          stepKey={stepKey}
          health={health}
          refresh={refresh}
          models={models}
          bulkCaps={bulkCaps} setBulkCaps={setBulkCaps}
          sandboxOptIn={sandboxOptIn} onSandboxToggle={toggleSandbox}
          applyMsg={applyMsg}
        />

        {/* footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 30 }}>
          {step > 0 && <button style={ghostBtn} onClick={back}>← Back</button>}
          <div style={{ flex: 1 }} />
          {stepKey === 'recap'
            ? <button style={primaryBtn(busy)} disabled={busy} onClick={markComplete}>{busy ? 'Entering…' : 'Enter Nexus →'}</button>
            : <button style={primaryBtn(false)} onClick={next}>Next →</button>}
        </div>
      </div>
    </div>
  )
}

// ── Per-step content ──────────────────────────────────────────────────────────
function StepBody({ stepKey, health, refresh, models, bulkCaps, setBulkCaps, sandboxOptIn, onSandboxToggle, applyMsg }) {
  const H = ({ children }) => <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>{children}</div>
  const P = ({ children }) => <div style={{ fontSize: 13, color: 'var(--color-text-2)', marginTop: 14, lineHeight: 1.7 }}>{children}</div>
  const Note = ({ children }) => <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 12, lineHeight: 1.6 }}>{children}</div>

  switch (stepKey) {
    case 'vault':
      return (<><H>Your vault</H>
        <P>Nexus works over a <strong>vault</strong> — a folder on disk (a Git repo or any directory)
          holding your agents, canon, and status. It reads that structure and adapts to it. Connect
          one now, or skip and do it later.</P>
        <VaultConnect health={health} refresh={refresh} /></>)

    case 'brain':
      return (<><H>The Brain & the Council</H>
        <P>You talk to a local <strong>Brain</strong> — a companion model that can answer directly or
          convene a <strong>Council</strong>: several cloud models that deliberate and hand back a
          synthesized result. Open <strong>Chat</strong> to talk to the Brain and add council members
          when a question deserves more than one mind.</P>
        <Note>Roundtable, Debate, and Orchestrator are the Council's operating modes — pick how the
          models work together per question.</Note></>)

    case 'models':
      return (<><H>Models & cost</H>
        <P>Nexus speaks to six clouds (Anthropic, OpenAI, Gemini, Mistral, DeepSeek, Qwen) plus a local
          <strong> Ollama</strong> runtime. It probes which are reachable and shows a live availability
          state, so you always know what you can call.</P>
        <Note>A cost meter tracks estimated spend per session and per model — you always see what
          you're spending. Local Ollama models are free.</Note></>)

    case 'capability':
      return <CapabilityStep models={models} bulkCaps={bulkCaps} setBulkCaps={setBulkCaps}
        sandboxOptIn={sandboxOptIn} onSandboxToggle={onSandboxToggle} applyMsg={applyMsg} />

    case 'recap':
      return <Recap bulkCaps={bulkCaps} sandboxOptIn={sandboxOptIn} health={health} refresh={refresh} />

    // ── learning track ──
    case 'l_concept':
      return (<><H>What an agentic system is</H>
        <P>An agentic system is a <strong>director</strong> coordinating specialized models and tools,
          with a shared place to <strong>remember</strong> and stay in sync. Nexus is the console over
          that system — it doesn't replace your models, it conducts them.</P></>)
    case 'l_memory':
      return (<><H>The memory layer comes first</H>
        <P>Durable memory is the <strong>foundation</strong>, not an afterthought. In Nexus the
          <strong> vault is the memory layer</strong>: agents read and write it, so context survives
          across runs and models. Get the memory layer right and everything above it gets simpler.</P></>)
    case 'l_repo':
      return (<><H>The repo / vault</H>
        <P>The vault is usually a Git repo — versioned, diffable, portable. Nexus detects the layout it
          finds: a <strong>registry-style</strong> agent repo, an <strong>SFS-style</strong> studio vault,
          or a <strong>generic</strong> folder, and adapts what it reads to each.</P></>)
    case 'l_registry':
      return (<><H>The agent registry</H>
        <P>A <strong>registry</strong> is where your agents are declared — their identities, roles, and
          posture. Nexus reads it into the <strong>Agents</strong> view so the roster of who's in your
          system is always visible and canonical.</P></>)
    case 'l_directing':
      return (<><H>Directing the council</H>
        <P>You direct through the <strong>Brain</strong>, which can convene the cloud unit. The
          <strong> modes</strong> — Roundtable (each answers), Debate (they challenge each other),
          Orchestrator (one plans, others execute) — let you choose how much deliberation a task
          deserves before the Brain synthesizes an answer.</P></>)

    default:
      return null
  }
}

// ── Vault connection (reuses the /api/config detection path — same code path as Setup) ──
function VaultConnect({ health, refresh }) {
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const connect = async () => {
    if (!path.trim()) return
    setBusy(true); setResult(null)
    try {
      const res = await fetch('/api/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath: path }),
      })
      const data = await res.json()
      setResult(data)
      if (data.ok) refresh()   // update App.health so the connected state shows everywhere
    } catch (e) { setResult({ ok: false, error: e.message }) }
    setBusy(false)
  }

  if (health?.repoFound) {
    return (
      <div style={{
        marginTop: 18, padding: '12px 14px', background: 'var(--color-logged-bg)',
        border: '0.5px solid var(--color-logged-border)', borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ fontSize: 12.5, color: 'var(--color-logged-text)', fontWeight: 600 }}>
          Connected — {health.vaultName || 'vault'}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--color-text-2)', marginTop: 4 }}>
          {VAULT_LABELS[health.vaultType] || health.vaultType || 'vault'} · ready.
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 18 }}>
      <div className="glyph-label" style={{ marginBottom: 6 }}>Vault path</div>
      <input value={path} onChange={e => setPath(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && connect()}
        placeholder="/Users/you/Documents/sfs-vault" autoFocus
        style={{ width: '100%', fontFamily: 'SF Mono, Menlo, monospace', fontSize: 12 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <button onClick={connect} disabled={busy || !path.trim()} style={{
          background: busy || !path.trim() ? 'var(--color-surface-3)' : 'var(--color-recursive-bg)',
          border: `0.5px solid ${busy || !path.trim() ? 'var(--color-border-mid)' : 'var(--color-recursive-border)'}`,
          color: busy || !path.trim() ? 'var(--color-text-3)' : 'var(--color-recursive-text)',
          borderRadius: 'var(--radius)', padding: '8px 16px', fontSize: 12, fontWeight: 600,
          cursor: busy || !path.trim() ? 'not-allowed' : 'pointer',
        }}>{busy ? 'Detecting…' : 'Detect & connect'}</button>
        {result && !result.ok && <span style={{ fontSize: 12, color: 'var(--color-unavailable)' }}>{result.error}</span>}
        <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>Optional — you can connect later.</span>
      </div>
    </div>
  )
}

// ── The capability & consent step (the heart) — writes INTENT ONLY ──
function CapabilityStep({ models, bulkCaps, setBulkCaps, sandboxOptIn, onSandboxToggle, applyMsg }) {
  const cloudCount = (models || []).filter(m => m && m.id && m.provider !== 'ollama' && providerSupports(m.provider, 'tools')).length
  const mcpCount = (models || []).filter(m => m && m.id && m.provider !== 'ollama' && providerSupports(m.provider, 'mcp')).length

  const Row = ({ children }) => (
    <div style={{ padding: '14px 16px', background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border-mid)', borderRadius: 'var(--radius-lg)', marginTop: 12 }}>{children}</div>
  )
  const Toggle = ({ on, onClick }) => (
    <button onClick={onClick} aria-pressed={on} style={{
      flexShrink: 0, width: 40, height: 22, borderRadius: 'var(--radius-pill)', position: 'relative', cursor: 'pointer',
      background: on ? 'var(--color-recursive-border)' : 'var(--color-surface-3)',
      border: '0.5px solid var(--color-border-strong)', transition: 'background 0.15s',
    }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 16, height: 16, borderRadius: '50%', background: 'var(--color-text)', transition: 'left 0.15s' }} />
    </button>
  )

  return (
    <>
      <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>Capabilities & consent</div>
      <div style={{ fontSize: 12.5, color: 'var(--color-text-2)', marginTop: 12, lineHeight: 1.7 }}>
        Set your advanced-capability posture. Everything here records a <strong>preference</strong> —
        nothing is turned on. You enable capabilities later, in Settings, as a reviewed step.
      </div>

      {/* §4.1 bulk capability intent → G8 */}
      <Row>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Enable advanced capabilities (tools + MCP) for cloud models</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 6, lineHeight: 1.6 }}>
              Records the intent for {cloudCount || 'all'} cloud model{cloudCount === 1 ? '' : 's'} to use tools
              {mcpCount ? `, and MCP for the ${mcpCount} that support it` : ''}. <strong style={{ color: 'var(--color-text-2)' }}>Not
              enforced</strong> — takes effect when you enable enforcement in Settings (gate G8). Computer-use is never enabled here.
            </div>
          </div>
          <Toggle on={bulkCaps} onClick={() => setBulkCaps(!bulkCaps)} />
        </div>
      </Row>

      {/* §4.2 broker — explainer only, configured OFF */}
      <Row>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Two-model approval broker</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 6, lineHeight: 1.6 }}>
          Optionally, a second independent model can vet routine tool requests so an autonomous run isn't
          always waiting on you. It ships <strong style={{ color: 'var(--color-text-2)' }}>configured but off</strong> —
          you pick the reviewer model and turn it on in Settings (gate G9). A built-in denylist (auth,
          keys, secrets, anything outside the sandbox) is always enforced and can't be widened here.
        </div>
      </Row>

      {/* §4.3 sandbox opt-in — the one live toggle (G3 approved off) */}
      <Row>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Sandbox — allow models to run tools</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 6, lineHeight: 1.6 }}>
              With the sandbox <strong>off</strong> (the default), no model can run any tool, capability
              preferences notwithstanding. You may opt in now; tool calls still require per-command
              approval. This is the one setting here that takes effect immediately.
            </div>
          </div>
          <Toggle on={sandboxOptIn} onClick={onSandboxToggle} />
        </div>
      </Row>

      <div style={{ fontSize: 11.5, color: 'var(--color-text-3)', marginTop: 14, lineHeight: 1.6 }}>
        🔒 Computer-use (a model controlling your screen) is off and stays off until a future,
        separately-reviewed release — Anthropic models first, with per-action approval.
      </div>
      {applyMsg && !applyMsg.ok && (
        <div style={{ fontSize: 12, color: 'var(--color-unavailable)', marginTop: 10 }}>{applyMsg.text}</div>
      )}
    </>
  )
}

// ── The honest recap + finish ──
function Recap({ bulkCaps, sandboxOptIn, health, refresh }) {
  const Line = ({ icon, children }) => (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 10, fontSize: 12.5, color: 'var(--color-text-2)', lineHeight: 1.6 }}>
      <span style={{ flexShrink: 0 }}>{icon}</span><span>{children}</span>
    </div>
  )
  return (
    <>
      <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>You're set</div>
      <div style={{ fontSize: 12.5, color: 'var(--color-text-3)', marginTop: 12, lineHeight: 1.7 }}>
        Here's exactly what was recorded versus what's live. Nothing dangerous is silently on.
      </div>
      <div style={{ marginTop: 8 }}>
        <Line icon="✅">Capability preferences {bulkCaps ? 'recorded' : 'unchanged'} — {bulkCaps ? 'not yet enforced; enable in Settings (gate G8).' : 'none set.'}</Line>
        <Line icon="⚙️">Broker — off. Configure a reviewer model and enable it in Settings (gate G9).</Line>
        <Line icon="⚙️">Sandbox: {sandboxOptIn ? 'on (per your choice) — tool calls still need per-command approval.' : 'off (the safe default).'}</Line>
        <Line icon="🔒">Computer-use: off (future release).</Line>
      </div>
      <div style={{ marginTop: 18 }}>
        <VaultConnect health={health} refresh={refresh} />
      </div>
    </>
  )
}
