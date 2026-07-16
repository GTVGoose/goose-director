# Echo Protocol — member presence & attribution for the SFS Vault membrane

**Date:** 2026-07-16
**Status:** DRAFT — written from the Director's problem statement (misattribution when
one member works on another member's machine). The revised Echo Protocol spec lives
outside this repo (sfs-vault); reconcile this draft against it before building.

## Problem

The system infers *who is acting* from *where the action came from* — machine,
chat ID, branch prefix, bound member. Those proxies break the moment members
share hardware: Boris architecting on the Director's Mac is read as David, so
follow-ups, fixes, and vault messages route to the wrong person. Identity of the
**channel** and identity of the **member** are currently the same thing; the Echo
Protocol separates them.

## The protocol in one line

A member announces themselves (**echo-in**), the system repeats its belief back
for confirmation (**echo-back**), and the confirmed presence **decays** unless
refreshed — every artifact produced meanwhile is stamped with the live, confirmed
identity instead of the machine default.

## The three legs

### 1. Echo-in (assertion)
Whoever starts working emits a presence claim:

```json
{
  "member": "boris",
  "host": "gooses-mac",
  "context": "relay streaming / cost meter",
  "started_at": "2026-07-16T14:02:00Z",
  "ttl_sec": 7200
}
```

Cheap to emit, from any surface the member already uses:
- Telegram bot command: `/echo boris` (chat ID already binds the sender)
- Vault CLI: `echo-in boris --context "relay work"`
- Git commit trailer: `Echoed-By: boris`

### 2. Echo-back (reflection + confirmation)
The system never silently trusts the claim. It reflects its belief back to the
*claimed* member over a channel only that member holds — their own Telegram chat
(`telegram.mjs` already keys `directorChatId` / `borisChatId` separately):

> "Reading you as **Boris** on the **Director's Mac**, working on the relay.
> Confirm?"

A tap closes the loop. Because the confirmation arrives on Boris's personal
channel, it doubles as lightweight authentication — David can't accidentally (or
deliberately) confirm as Boris. The round trip — signal out, reflection back —
is what makes it an *echo* protocol: identity is established by the reply, not
the announcement.

### 3. Decay (TTL / heartbeat)
Presence expires unless refreshed (activity on an echoed context auto-refreshes;
the vault heartbeat's Sense stage nudges near expiry: "Still Boris on the
Director's Mac?"). When an echo lapses, the system does **not** fall back to
assuming the machine owner — it downgrades to `unattributed / low-confidence`
and asks before routing anything consequential. Stale identity is worse than no
identity.

## Vault implementation sketch

New files in `_system/bridge/`, beside `member-registry.json`:

| File | Role |
|---|---|
| `presence.json` | Current live echoes (member, host, context, confirmed, expiry) |
| `echo-log.jsonl` | Append-only history — the attribution audit trail |

Consumers, in rough build order:

1. **Message stamping** — vault routines add `presence` (echo id + confidence)
   next to `produced_by` on every outbound message; `delivery-log.jsonl`
   receipts carry it through, so misattribution becomes visible in the log
   instead of discovered downstream.
2. **Routing** — `vault_bridge` routing and `gate.mjs`'s `isPersonalBound`
   consult `presence.json`: "send the fix to whoever was working on X" resolves
   via the echo log (who was echoed-in on that host/context at that time), never
   via machine ownership. Studio traffic rules are unchanged — this only fixes
   *which member* a member-bound message resolves to.
3. **Heartbeat sensing** — the Vault Master Heartbeat treats expiring/unconfirmed
   echoes as a sensed condition and fires the echo-back nudge.
4. **Membrane UI** — a presence strip on the Membrane view (this repo,
   `src/components/Membrane.jsx`): who is live, on which host, in which context,
   and at what confidence. Read-only mirror of `presence.json`.
5. **Commit attribution** — merge-gate reads the `Echoed-By:` trailer so vault
   PR history reflects members, not machine git configs.

## Non-goals

- Not security/auth in the strong sense — echo-back over a member-bound channel
  deters mistakes and casual impersonation, not a determined attacker.
- Not surveillance — echoes are self-asserted and member-visible; the log
  records claims and confirmations, not keystrokes.
- No change to the membrane's contribution governance (one PR door, octagon
  review, Boris holds vault admin).

## Open questions for the revised spec

- Auto-echo: should activity on a member's *own* machine create an implicit
  confirmed echo, with explicit echo-in only required on foreign hardware?
- TTL defaults: per-member, per-context, or global?
- Conflict rule when two members are echoed-in on the same host/context
  simultaneously (pairing sessions) — dual-stamp, or primary + witness?
