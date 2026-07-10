// ─────────────────────────────────────────────────────────────────────────────
// gate.mjs — Umbruh ingress gate (PERSONAL, C lineage)
//
// The SFS vault used to push raw text straight to the Director's Telegram via
// its own sendMessage side-door (vault_bridge.py drain-outbox). That violated
// the channel's contract: everything the Director reads on his personal
// channel should pass through the Goose system first, which knows how to
// process information for him. Retired 2026-07-09 (Director directive).
//
// This service replaces it:
//   1. WATCH — every gate.intervalSec, scan the vault bridge for inbound
//      personal-channel messages:
//        a. <bridgeDir>/gate-inbox/*.json — handoffs written by vault_bridge
//           when PERSONAL_DELIVERY_MODE=gate (post-merge of the bridge PR).
//        b. <bridgeDir>/initiate.json — the legacy outbox, claimed directly
//           while the vault drain job is retired. Only PERSONAL-bound messages
//           are claimed (to: "" | boundMember | unknown non-member); studio
//           traffic (to: "all" or another member) is left for the studio
//           bridge and never touches this channel.
//   2. VOICE — each message is run through the local Umbruh model
//      (config.umbruhLocalModel, no tools): filter + re-voice for the
//      Director, preserving load-bearing facts verbatim. If the model is
//      unreachable or returns junk, the ORIGINAL text is delivered with an
//      "unvoiced" marker — the gate never silently loses a message.
//      The model may answer `DROP: <reason>` for pure noise; dropped
//      originals are archived, never deleted.
//   3. DELIVER — through telegram.mjs's notify() (audience: director), the
//      same connection that owns the bot's long-poll. Receipts append to the
//      vault's delivery-log.jsonl (channel "umbruh-gate") so the vault
//      heartbeat's delivery sensing keeps working unchanged.
//
// Failure handling mirrors the vault bridge contract: a message is removed
// from the queue only after a confirmed send; failures are annotated with a
// `_delivery` block (same schema as vault_bridge.py) and retried with 5-min
// backoff. Processed originals land in gate-inbox/processed/ for audit.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs'
import path from 'path'
import os from 'os'

const RETRY_MS = 5 * 60 * 1000

export function initGate({ config, ollamaUrl }) {
  const cfg = config.gate || {}
  const bridgeDir = cfg.bridgeDir || ''
  const boundMember = String(cfg.boundMember || '').toLowerCase()
  const intervalSec = Number(cfg.intervalSec) || 60
  const model = config.umbruhLocalModel || 'umbruh-lite'

  const inboxDir = path.join(bridgeDir, 'gate-inbox')
  const processedDir = path.join(inboxDir, 'processed')
  const outboxPath = path.join(bridgeDir, 'initiate.json')
  const registryPath = path.join(bridgeDir, 'member-registry.json')
  const deliveryLogPath = path.join(bridgeDir, 'delivery-log.jsonl')

  let notify = null // injected by server.mjs after initTelegram
  const setNotify = (fn) => { notify = fn }

  const log = (msg) => console.log(`[gate] ${msg}`)

  if (!cfg.enabled || !bridgeDir || !fs.existsSync(bridgeDir)) {
    log(`disabled (enabled=${!!cfg.enabled}, bridgeDir=${bridgeDir || 'unset'})`)
    return { setNotify, enabled: false }
  }

  const readJson = (p, fallback = null) => {
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fallback }
  }

  const recordReceipt = (receipt) => {
    try {
      fs.appendFileSync(deliveryLogPath, JSON.stringify({ ts: new Date().toISOString(), ...receipt }) + '\n')
    } catch (e) { log(`receipt write failed: ${e.message}`) }
  }

  // Personal-bound test, mirroring vault_bridge.deliver_outbox routing: the
  // gate may only take what would reach the Director's own channel.
  const isPersonalBound = (to) => {
    const t = String(to || '').trim().toLowerCase()
    if (!t) return true
    if (t === 'all') return false
    const members = (readJson(registryPath, {})?.members) || []
    const known = members.some((m) => String(m.member || '').toLowerCase() === t)
    if (known && t !== boundMember) return false // another member's mail — never this channel
    return true
  }

  // Claim the legacy outbox (rename-first, same protocol as the vault drain)
  // and move personal-bound messages into gate-inbox as normal handoffs.
  const claimLegacyOutbox = () => {
    const peek = readJson(outboxPath)
    if (!peek || !isPersonalBound(peek.to)) return // absent, unreadable mid-write, or studio traffic
    const claim = `${outboxPath}.sending-${process.pid}`
    try { fs.renameSync(outboxPath, claim) } catch { return } // raced — someone else claimed
    const data = readJson(claim)
    if (!data) { try { fs.renameSync(claim, outboxPath) } catch {} ; return }
    if (!isPersonalBound(data.to)) { // outbox was replaced between peek and rename
      try { fs.renameSync(claim, outboxPath) } catch {}
      return
    }
    fs.mkdirSync(inboxDir, { recursive: true })
    data._gate = { handed_at: new Date().toISOString(), source: 'gate-legacy-outbox-claim' }
    const dest = path.join(inboxDir, `${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}Z-${process.pid}.json`)
    fs.writeFileSync(dest, JSON.stringify(data, null, 2))
    fs.unlinkSync(claim)
    log(`claimed legacy outbox → ${path.basename(dest)}`)
  }

  // ── Umbruh voicing ─────────────────────────────────────────────────────────
  // umbruh-lite carries the full persona (incl. the recipient identity lock) in
  // its baked SYSTEM prompt; the gate only supplies the task frame. No tools.
  const voiceMessage = async (data) => {
    const raw = String(data.message || '').trim()
    const meta = []
    if (data.title) meta.push(`title: ${data.title}`)
    if (data.urgency) meta.push(`urgency: ${data.urgency}`)
    if (data.produced_by) meta.push(`produced by: ${data.produced_by}`)
    const prompt = [
      'GATE TASK (not a conversation turn): a message from the SFS vault\'s automated',
      'routines is queued for the Director\'s phone. Rewrite it in your own voice,',
      'speaking to the Director. Rules:',
      '- Preserve every load-bearing fact EXACTLY as stated: deadlines, dates, amounts,',
      '  names, links, file paths, and required actions. Never invent, merge, or',
      '  reattribute facts. If unsure how to rephrase a fact, keep its original wording.',
      '- Lead with what he needs to know or do. Keep it tight — this is a phone message.',
      '- Strip studio-broadcast framing; this channel is for what GOOSE needs.',
      '- Output ONLY the rewritten message text. No preamble, no surrounding quotes,',
      '  no notes or commentary about this task.',
      meta.length ? `\nMessage metadata: ${meta.join(' · ')}` : '',
      '\n--- VAULT MESSAGE ---\n' + raw,
    ].join('\n')

    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 120_000)
    try {
      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          options: { temperature: 0.2 }, // factual rewrite — override the persona's chat temp
        }),
        signal: ctl.signal,
      })
      if (!res.ok) throw new Error(`ollama HTTP ${res.status}`)
      let out = (await res.json())?.message?.content?.trim() || ''
      out = out.replace(/^["']+/, '').replace(/["']+$/, '').trim() // small models love quote-wrapping
      if (!out) throw new Error('empty model output')
      return { voiced: out, ok: true }
    } finally {
      clearTimeout(timer)
    }
  }

  // ── Queue processor ────────────────────────────────────────────────────────
  let running = false
  const processQueue = async () => {
    if (running) return
    running = true
    try {
      claimLegacyOutbox()
      if (!fs.existsSync(inboxDir)) return
      const files = fs.readdirSync(inboxDir).filter((f) => f.endsWith('.json')).sort()
      for (const name of files) {
        const p = path.join(inboxDir, name)
        const data = readJson(p)
        if (!data) continue // unreadable/mid-write; retry next pass
        const raw = String(data.message || '').trim()

        if (!raw) {
          archive(p, data, { status: 'skipped', error: 'empty message' })
          continue
        }
        if (data.deliver_after && Date.now() < Date.parse(data.deliver_after)) continue
        const lastAttempt = Number(data._delivery?.last_attempt_epoch || 0) * 1000
        if (lastAttempt && Date.now() - lastAttempt < RETRY_MS) continue
        if (!notify) { log('notify not injected yet — holding queue'); return }

        // Already-Umbruh content (e.g. the morning brief runner) is sent as-is:
        // re-voicing long Umbruh-authored text through the small model would
        // compress or mangle it for no gain.
        const alreadyUmbruh = /umbruh/i.test(String(data.produced_by || ''))
        let voiced = null
        let voicedOk = false
        if (!alreadyUmbruh) {
          try {
            const v = await voiceMessage(data)
            voiced = v.voiced
            voicedOk = v.ok
          } catch (e) {
            log(`voicing failed (${e.message}) — delivering original unvoiced`)
          }
        }

        const text = alreadyUmbruh ? raw : voicedOk ? voiced : `⚑ vault (unvoiced):\n${raw}`
        try {
          await notify(text) // audience: director (default) — this channel only
        } catch (e) {
          markFailed(p, data, e.message)
          continue
        }
        archive(p, data, {
          status: 'delivered',
          voiced: alreadyUmbruh ? 'source' : voicedOk,
          gate_model: model,
          voiced_preview: text.slice(0, 160),
        })
        log(`delivered ${name} (voiced=${alreadyUmbruh ? 'source' : voicedOk})`)
      }
    } catch (e) {
      log(`queue pass error: ${e.message}`)
    } finally {
      running = false
    }
  }

  const archive = (p, data, extra) => {
    recordReceipt({
      channel: 'umbruh-gate',
      source: data._gate?.source || data.source || 'gate-inbox',
      to: data.to || undefined,
      title: data.title || '',
      urgency: data.urgency,
      produced_by: data.produced_by,
      message_preview: String(data.message || '').slice(0, 160),
      host: os.hostname(),
      ...extra,
    })
    try {
      fs.mkdirSync(processedDir, { recursive: true })
      data._gate_result = { at: new Date().toISOString(), ...extra }
      fs.writeFileSync(path.join(processedDir, path.basename(p)), JSON.stringify(data, null, 2))
      fs.unlinkSync(p)
    } catch (e) { log(`archive failed for ${path.basename(p)}: ${e.message}`) }
  }

  const markFailed = (p, data, error) => {
    data._delivery = {
      status: 'failed',
      attempts: Number(data._delivery?.attempts || 0) + 1,
      last_attempt_at: new Date().toISOString(),
      last_attempt_epoch: Date.now() / 1000,
      last_error: String(error).slice(0, 300),
    }
    try { fs.writeFileSync(p, JSON.stringify(data, null, 2)) } catch {}
    recordReceipt({
      channel: 'umbruh-gate',
      source: data._gate?.source || 'gate-inbox',
      status: 'failed',
      message_preview: String(data.message || '').slice(0, 160),
      error: String(error).slice(0, 300),
    })
    log(`delivery failed (attempt ${data._delivery.attempts}): ${error}`)
  }

  setInterval(processQueue, intervalSec * 1000)
  processQueue()
  log(`watching ${inboxDir} + legacy outbox (bound member: ${boundMember || 'unset'}, model: ${model})`)

  return { setNotify, enabled: true, processQueue }
}
