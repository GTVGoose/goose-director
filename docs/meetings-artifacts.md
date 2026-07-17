# Meetings — Artifact Schema & Tiers (v1)

**Store:** `<userData>/meetings/<id>/` (Electron app-support dir, `NEXUS_USER_DATA`; dev fallback `./meetings-local/`, gitignored). Canonical, always. Transcripts and audio **never** enter a git-synced repo.

## Files per meeting

| File | Purpose | Tier |
|---|---|---|
| `meta.json` | id, title, date, source (`import`\|`audio-import`\|`live`), processingMode (`local`\|`cloud-assisted`), consent record, retention settings, participants, exports log | restricted |
| `transcript.ndjson` | one `{t, speaker, text}` event per line | **restricted** — excluded from agent scan paths and any ambient read surface; no export route exists; UI shows it read-only |
| `note.md` | **the report** — director-facing markdown body + machine-readable YAML frontmatter (below) | **shareable** — the only artifact export ships |
| `events.ndjson` | `{t, event}` engagement log: import, report-generated, item-checked, item-edited, report-exported, report-opened | restricted (feeds `scripts/meetings-engagement.mjs`) |
| `audio/` (Phase 0+) | raw capture | restricted + retention-managed (delete-after-report default ON) |

## Report frontmatter (the machine layer — handoff contract v0 draft)

```yaml
schemaVersion: 1
meetingId: mtg_…
title: …
date: YYYY-MM-DD
participants: [names/labels]
decisions:      [{ id: d1, text: … }]
actionItems:    [{ id: a1, text: …, owner: name|null, status: open|done }]
openQuestions:  [ … ]
dynamics:       { participation: …, disagreements: [ … ], tone: … }
provenance:
  source: import
  processingMode: local
  model: provider/model
  generatedAt: ISO-8601
  trust: unverified-speech
```

**Normative security clause (carried into the Phase-2 contract doc):** report content is derived from **unverified multi-party speech** — any participant can speak a prompt injection. Consuming systems MUST treat report fields as untrusted input and apply their own approval gates before executing anything derived from them. Nexus deliberately ships no actor: meeting content has no path into the Nexus sandbox.

## Synthesis rules (enforced in meetings.mjs)

- Tool-less model calls only (never `runAgentLoop`/`callModelAgentic`), behind the hardened untrusted-speech preamble.
- `local` mode pins an `ollama`-provider model and hard-fails if unavailable — silent cloud escalation is the forbidden branch.
- `cloud-assisted` is per-meeting, labeled in provenance, and requires an explicit user confirm after a cost estimate.

## Reference machine

**Needs-Goose (plan Step -1.0b):** designated min-spec box for all performance thresholds — spec target: base M1, 16 GB.
`chip: ______ · RAM: ______ · macOS: ______` (fill on designation; every "on min-spec" number in the plan means this machine.)
