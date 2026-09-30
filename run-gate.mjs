#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// run-gate.mjs — standalone host for the Umbruh ingress gate (gate.mjs)
//
// gate.mjs normally runs inside the Nexus server, so vault → Director delivery
// stops whenever Nexus.app is closed. This runner hosts the same gate as an
// always-on launchd service (com.goose.umbruh-gate) with a SEND-ONLY Telegram
// client: it never calls getUpdates, so it cannot fight Nexus for the bot's
// long-poll. When both are up, gate.mjs's consumer lease lets only one drain.
//
// Config: JSON at $UMBRUH_GATE_CONFIG (default ~/.umbruh-gate/config.json):
//   { "bridgeDir": "<vault>/_system/bridge", "boundMember": "david",
//     "chatId": "<director chat id>", "intervalSec": 60,
//     "ollamaUrl": "http://127.0.0.1:11434", "umbruhLocalModel": "umbruh-lite",
//     "keychainService": "TELEGRAM_BOT_TOKEN" }
// Token: $TELEGRAM_BOT_TOKEN, else the macOS Keychain generic password named
// by keychainService. It is never written to disk or logged.
//
// History: the first runner of this kind was never committed and was lost
// after a SIGTERM on 2026-08-14; the vault queue then stranded for ~45 days.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { initGate } from './gate.mjs'

const stamp = () => new Date().toISOString()
const log = (msg) => console.log(`[umbruh-gate] ${stamp()} ${msg}`)

const configPath = process.env.UMBRUH_GATE_CONFIG || path.join(os.homedir(), '.umbruh-gate', 'config.json')
let rc
try {
  rc = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
} catch (e) {
  log(`cannot read config ${configPath}: ${e.message}`)
  process.exit(78) // EX_CONFIG
}

let token = process.env.TELEGRAM_BOT_TOKEN || ''
if (!token) {
  try {
    token = execFileSync('/usr/bin/security',
      ['find-generic-password', '-s', rc.keychainService || 'TELEGRAM_BOT_TOKEN', '-w'],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    log('loaded TELEGRAM_BOT_TOKEN from Keychain')
  } catch {
    log('no TELEGRAM_BOT_TOKEN in env or Keychain')
    process.exit(78)
  }
}
const chatId = String(rc.chatId || '').trim()
if (!chatId) { log('config.chatId is required'); process.exit(78) }

const API = `https://api.telegram.org/bot${token}`
const LIMIT = 4000 // Telegram caps a message at 4096 chars

const call = async (method, body) => {
  const r = await fetch(`${API}/${method}`, { method: 'POST', body, signal: AbortSignal.timeout(120_000) })
  const data = await r.json().catch(() => ({}))
  if (!data.ok) throw new Error(`${method}: ${data.description || `HTTP ${r.status}`}`)
  return data.result
}

// Throws on failure, so gate.mjs keeps the message queued and retries.
async function notify(text) {
  const s = String(text)
  for (let i = 0; i < s.length; i += LIMIT) {
    const form = new FormData()
    form.append('chat_id', chatId)
    form.append('text', s.slice(i, i + LIMIT))
    await call('sendMessage', form)
  }
}

async function notifyDocument(filePath) {
  const form = new FormData()
  form.append('chat_id', chatId)
  form.append('document', new Blob([fs.readFileSync(filePath)]), path.basename(filePath))
  await call('sendDocument', form)
}

const gate = initGate({
  config: {
    gate: {
      enabled: true,
      bridgeDir: rc.bridgeDir,
      boundMember: rc.boundMember,
      intervalSec: rc.intervalSec,
      hostLabel: 'run-gate',
    },
    umbruhLocalModel: rc.umbruhLocalModel,
  },
  ollamaUrl: rc.ollamaUrl || 'http://127.0.0.1:11434',
})
if (!gate.enabled) { log('gate disabled — check bridgeDir'); process.exit(78) }
gate.setNotify(notify)
gate.setNotifyDocument(notifyDocument)
gate.processQueue() // first pass fired before notify was injected; run one now
log(`running · bridgeDir=${rc.bridgeDir} · interval=${rc.intervalSec || 60}s`)

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => { log(`${sig} — exiting`); gate.releaseLease(); process.exit(0) })
}
