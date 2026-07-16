# Echo Protocol → the membrane: what crosses into the SFS Vault, and when

**Date:** 2026-07-16 (v2 — corrects the same-day v1 draft, which reconstructed the
protocol from the problem statement before the goose-agent-system repo was attached.
The real spec: `goose-agent-system/agents/echo/echo-capture-protocol.md` +
`AGT-VOX-001_TheEcho_VaultGrade_v1.md`.)

## What the Echo Protocol actually is

The Echo (AGT-VOX-001) is the Goose voice-keeper: Capture · Corpus · Consolidation ·
Gate. The **Echo Capture Protocol** governs how the corpus is allowed to grow:

- **Explicit triggers only, never ambient** — "this is Goose" in a session, an Umbruh
  voice-session flag, or the `bin/echo-capture` CLI. Three authenticated channels (D2).
- **The shared-machine rule (revised 2026-07-03):** Boris also uses the Director's
  machine, so **machine / user account is NOT proof of authorship**. Historical mining
  is disabled; the corpus grows forward-only from explicit marks and Director-named
  standing sources.
- **Provenance on every entry** — `{ts, channel, modality, register, context, origin}`,
  where `origin: director-explicit` is a poison lock writable only by the
  authenticated channels (§5-F1).

This is the load-bearing insight for member tracking generally: **identity is never
inferred from the machine; it is asserted through a channel bound to the member.**

## Hard boundary (charter, non-negotiable)

The raw corpus is Goose-personal, gitignored, and **never enters sfs-vault**. Studio
agents may consume **gate verdicts and distilled voice-guide artifacts only**. Nothing
below proposes moving the corpus; the Director has also directed that nothing crosses
until the Echo is proven working.

## What can cross the membrane, in graduation order

### 1. The attribution discipline (pattern, not data) — available now
Generalize the capture protocol's provenance rule to vault member tracking:

- Vault messages, receipts, and merge-gate commits carry
  `{member, channel, origin}`, where `origin: member-explicit` may only be written
  by a channel authenticated to that member — their own Telegram chat ID
  (`telegram.mjs` already keys `directorChatId` / `borisChatId`), a per-member CLI
  on their own account, or an explicit in-session declaration ("this is Boris").
- No channel may infer member identity from host or git user — the vault-side
  mirror of the shared-machine rule. Unasserted actions are `unattributed`, never
  defaulted to the machine owner. This is the direct fix for fixes routing to the
  wrong member.
- `delivery-log.jsonl` and `member-registry.json` already exist in
  `_system/bridge/`; this adds an origin field and an assertion path, not new
  infrastructure.
- Symmetry: Boris can run the same protocol from his fleet ("this is Boris");
  per-member corpora stay inside each organism, only attribution metadata is shared.

### 2. Gate verdicts as a membrane service — after Phase 2/3 prove out
The Gate's four legs (authorship verifier, style-embedding cosine, cross-family LLM
judge, claims-ledger check) become a service studio flows can call: pass/fail + 
confidence, served through the membrane. Raw corpus stays home; the verdict travels.

### 3. The claims ledger as a vault-wide breaker — separable, crosses early if wanted
"Every factual claim in outbound copy must resolve to a verifiable data point; an
unverifiable claim is a hard fail regardless of style" (§5-F8) has nothing
Goose-specific in it. It could be adopted as a studio circuit breaker on any
outbound surface independent of the voice work.

### 4. Edit-pair minting on member finalizes — with Phase 3
Every T-A finalize mints an (agent draft, member final) pair. In the vault this
doubles as attribution-correct training signal per member — but only once leg 1
(attribution) is in place, or the pairs inherit the same misattribution bug.

## Readiness bar before anything crosses

Per the Director: not until it actually works. Concretely, borrow the charter's own
graduation logic (§3): the Gate passes its monthly blind test on the relevant
register, and the T-A zero-edit record holds (20 consecutive zero-edit finalizes,
≥95% zero-edit over rolling 30 days) before any studio flow consumes verdicts.
Leg 1 (the attribution pattern) has no corpus dependency and needs no such bar —
it can be adopted vault-side as soon as the schema is agreed through the one PR door.

## Name collision note

"The Echo" (AGT-VOX-001, voice-keeper) is distinct from the **Presence / Echo sigil**
(SIG-PE-001, enforced by Antiphon): the sigil's "echo" is a hollow-agreement failure
mode in engagement quality. Same word, orthogonal concepts; membrane docs should say
"Echo Protocol (AGT-VOX-001 capture)" when precision matters.
