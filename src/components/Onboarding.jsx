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

// Buyer-facing detection labels shown INSIDE onboarding (VaultConnect success state). Kept
// neutral/generic on purpose — onboarding copy must never surface an internal project name.
// (Setup.jsx/Settings.jsx carry their own copies of this map; neutralizing those is a flagged
// follow-up, out of this slide-copy task's scope.)
const VAULT_LABELS = {
  goose: 'Agent-repo layout',
  sfs: 'Studio-style vault',
  generic: 'Generic folder',
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
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 14 }}>Welcome to Nexus</div>
          <div style={{ fontSize: 14, color: 'var(--color-text-2)', marginTop: 14, lineHeight: 1.7, maxWidth: 480 }}>
            Nexus is a console for working with many AI models at once — and for building your own
            team of AI agents around a project you care about. You bring the models (your own API
            keys) and a folder of work; Nexus gives you the room to direct them.
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--color-text-3)', marginTop: 14, lineHeight: 1.6, maxWidth: 480 }}>
            This takes about three minutes. You can skip anytime, and everything is changeable later
            in Settings.
          </div>
          <div style={{ marginTop: 28 }}>
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
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>How do you want to start?</div>
          <div style={{ fontSize: 12.5, color: 'var(--color-text-3)', marginTop: 10, lineHeight: 1.6 }}>
            Pick a path — there's no wrong answer, and you can revisit this later from Settings.
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 20, flexWrap: 'wrap' }}>
            {pathCard(() => startTrack('tour'),
              'Take the tour',
              'A short guided walk through what Nexus does — connecting your work, the Brain and the Council of models, what things cost, and how advanced capabilities work.')}
            {pathCard(() => startTrack('learn'),
              'Teach me the ideas',
              'A concept-first track for anyone new to AI agents: the memory layer, using a repository as a workspace, an agent registry, and directing a council — with Nexus as the worked example.')}
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
          <div style={{ fontSize: 18, fontWeight: 600 }}>Skip the intro?</div>
          <div style={{ fontSize: 12.5, color: 'var(--color-text-2)', marginTop: 12, lineHeight: 1.7 }}>
            No problem. You can reopen the tour and the learning track anytime from <strong style={{ color: 'var(--color-text)' }}>Settings → Onboarding</strong>.
            If you haven't connected a folder yet, we'll take you there next. Nothing was enabled — advanced capabilities stay off until you turn them on.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            <button style={primaryBtn(busy)} disabled={busy} onClick={markComplete}>
              {busy ? 'Skipping…' : 'Skip anyway →'}
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
      return (<><H>Connect a folder of work</H>
        <P>Nexus works <em>on</em> something — a folder on your computer (often a Git repository)
          that holds your project, notes, or knowledge base. Point Nexus at it and it can read that
          material, keep a running status log, and let your models act with real context instead of a
          blank slate.</P>
        <Note>New to this? A "repository" is just a tracked folder. The learning track explains repos
          and Git from scratch — for now, any folder you choose works, and you can change it later in
          Settings.</Note>
        <VaultConnect health={health} refresh={refresh} /></>)

    case 'brain':
      return (<><H>One Brain, a Council of models</H>
        <P>You talk to the <strong>Brain</strong> — the model that runs the conversation and directs
          the work. When a question is worth more than one opinion, the Brain can convene a
          <strong> Council</strong>: several models answer in parallel, and the Brain reads them all
          and synthesizes one grounded reply. You see each member's turn, so nothing is a black box.</P>
        <Note>Roundtable, debate, or orchestrator — the Council has a few modes for how the members
          work together. Start with the default; explore the rest when you're comfortable.</Note></>)

    case 'models':
      return (<><H>Bring your own models</H>
        <P>Nexus doesn't sell you tokens. You connect the providers you already use with your own API
          keys, and you can run a local model too — keeping a conversation entirely on your machine
          when you want. Any model can be the Brain or a Council member.</P>
        <Note>A built-in cost meter estimates spend per session and per model in real time, so you
          always see what a conversation costs. Prices are estimates you can confirm in Settings; a
          local model is free.</Note></>)

    case 'capability':
      return <CapabilityStep models={models} bulkCaps={bulkCaps} setBulkCaps={setBulkCaps}
        sandboxOptIn={sandboxOptIn} onSandboxToggle={onSandboxToggle} applyMsg={applyMsg} />

    case 'recap':
      return <Recap bulkCaps={bulkCaps} sandboxOptIn={sandboxOptIn} health={health} refresh={refresh} />

    // ── learning track ──
    case 'l_concept':
      return (<><H>What is an "agentic system"?</H>
        <P>A plain AI chat answers a question and forgets it. An <strong>agentic system</strong> gives
          a model three things a chat lacks: a <strong>memory</strong> it can keep, a
          <strong> workspace</strong> it can act in, and a <strong>goal</strong> it works toward across
          many steps. Nexus is a place to assemble those pieces around your own project.</P>
        <Note>You don't need to be a programmer. You need a goal, a folder to work in, and a
          willingness to direct.</Note></>)
    case 'l_memory':
      return (<><H>Memory is the first building block</H>
        <P>Models forget everything between sessions unless you give them somewhere to write things
          down. A <strong>memory layer</strong> is simply durable notes — decisions, facts, and context
          saved as files your agents read next time. Treating memory as a first-class part of your
          system, not an afterthought, is what lets it improve instead of resetting every day.</P>
        <Note>In practice this is just text files in your folder. Simple, inspectable, yours.</Note></>)
    case 'l_repo':
      return (<><H>Your workspace is a repository</H>
        <P>A <strong>repository</strong> (repo) is a folder whose history is tracked, usually with
          <strong> Git</strong>. That tracked history is what makes agent work safe: every change is
          recorded, you can review it, and you can undo it. Hosting the repo on a service like
          <strong> GitHub</strong> adds a backup and a place to collaborate.</P>
        <Note>New to Git and GitHub? Start with a plain local folder and add Git later — any folder
          you choose works today.</Note></>)
    case 'l_registry':
      return (<><H>Keep a registry of your agents</H>
        <P>As your system grows you'll have more than one agent — a researcher, a writer, a reviewer.
          An <strong>agent registry</strong> is a simple list that says who each agent is, what it's
          allowed to do, and who it answers to. It keeps a growing team organized and makes each
          agent's role explicit instead of implied.</P>
        <Note>Start with one agent and a one-line description. The structure earns its keep as you add
          more.</Note></>)
    case 'l_directing':
      return (<><H>You are the director</H>
        <P>The skill that makes agentic systems work is <strong>direction</strong>: stating the goal
          clearly, choosing which models weigh in, and judging their output. The Brain helps, but you
          set the objective and the standard. Convening a Council of models for a hard call — and
          reading their disagreement — is often how you get an answer you can trust.</P>
        <Note>Good direction beats a bigger model. Start small, watch what each model does well, and
          delegate from there.</Note></>)

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
        placeholder="/Users/you/Documents/my-project" autoFocus
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
      <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>Advanced capabilities — set the intent, stay in control</div>
      <div style={{ fontSize: 12.5, color: 'var(--color-text-2)', marginTop: 12, lineHeight: 1.7 }}>
        Beyond chatting, models can be granted <strong>tools</strong> (run commands, read/write files)
        and <strong>connectors</strong> (MCP). These are powerful, so Nexus ships them <strong>off</strong>.
        Below, mark which cloud models you'd <em>like</em> to grant them to — it records your intent
        only and turns nothing on.
      </div>

      {/* §4.1 bulk capability intent → G8 */}
      <Row>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Prepare tools + connectors for your cloud models (records intent only)</div>
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
            <div style={{ fontSize: 13, fontWeight: 600 }}>Turn on the sandbox to let models run tools (recommended off until you need it)</div>
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
        Nothing here acts on its own. When you actually enable a capability, Nexus adds a separate
        confirmation — with per-command approval for anything a model runs. 🔒 Screen control
        ("computer use") stays off until a dedicated consent screen ships.
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
      <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>You're ready</div>
      <div style={{ fontSize: 12.5, color: 'var(--color-text-2)', marginTop: 12, lineHeight: 1.7 }}>
        Connect your work, talk to the Brain, convene the Council when you want more minds, and grant
        capabilities deliberately. Nothing advanced is switched on — you're in a safe, read-and-chat
        state until you choose otherwise. Here's exactly what was recorded versus what's live:
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
