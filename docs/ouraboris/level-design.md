# OuraBoris — Threshold Level Design Architecture

**Status:** Proposal / working draft
**Origin:** Director design session, 2026-07-02
**Supersedes:** the flat "New Game / New Game+" reading of thresholds

---

## 1. The problem this solves

Right now thresholds only exist as *states the player reaches* — effectively a
New Game / New Game+ toggle. That gives us a loop, but not a **ladder**. There
is no felt sense of "I am at level 2 now and the world knows it." Progress is
binary and invisible.

This document reframes thresholds as **level transitions**: crossing a
threshold is the level-1-to-level-2 experience. Each crossing changes three
things at once — the narrative, the physics, and the player's mechanical
reach — so progress is legible in the fiction, in the world, and in the hands.

## 2. Design pillars

1. **Decay is progress.** The core reveal of the game is that the world state
   is decaying — the simulation is breaking down. The decay **pre-exists the
   player** (it is discovered), but **the player's advancement accelerates
   it** (it is caused). We invert the usual framing: instead of the player
   restoring a broken world, exploration exposes the breakdown and each
   threshold crossing deepens it. Every threshold crossed makes the world
   less stable and the player more capable. The ouroboros eats itself; the
   player climbs the coils as they unravel — and their climbing is part of
   why they unravel.

2. **Leakage is the reward currency.** When the "matrix" cracks, it leaks.
   Leakage is where the impossible becomes possible: lore that shouldn't be
   readable, places that shouldn't be reachable, mechanics that shouldn't
   stack. Rewards are never handed out by menu — they are *found in the
   cracks*.

3. **Meta-awareness is earned, not ambient.** The player character's awareness
   that they are inside a decaying construct rises one step per threshold,
   and only ever one step. The player should always be slightly ahead of the
   character — noticing a glitch the character hasn't remarked on yet — so
   each threshold's narrative beat lands as confirmation, not exposition.

4. **Mechanics deepen instead of multiplying.** Higher thresholds don't add
   new verbs; they remove the *rules that limited the existing verbs*. The
   move you learned in Threshold 0 is the move you break the game with in
   Threshold 4. Mastery reads as the world failing to contain you.

## 3. The threshold ladder

Thresholds are numbered strata, not save-file prefixes. Each threshold defines
four layers that must all advance together:

| Layer | Question it answers |
|---|---|
| **Narrative reveal** | What does the player now understand about the world? |
| **Decay state** | What has visibly broken since the last threshold? |
| **Leakage class** | What new kind of crack can the player exploit? |
| **Mechanical reach** | What former limit on an existing mechanic is gone? |

### Reference ladder (five thresholds, tune freely)

**Threshold 0 — The Intact World**
- *Reveal:* none. The world presents as whole and self-consistent.
- *Decay:* hidden. One or two seams exist but are deniable ("that's just a
  weird texture").
- *Leakage:* none accessible. The player can *see* one crack — this is the
  promise, and **touching it is the 0→1 crossing** (patch P4): a deliberate,
  self-inflicted act, same shape as every other rung. Until it is touched,
  the world stays intact and the Threshold 1 escalation never starts.
- *Reach:* baseline verbs, fully rule-bound.

**Threshold 1 — The First Seam**
- *Reveal:* something is wrong with the world, not with you. A repeated event
  repeats *incorrectly*.
- *Decay:* cosmetic leakage — flickers, duplicated NPC lines, geometry that
  doesn't quite meet. Purely readable, not yet usable.
- *Leakage:* **lore leaks.** Documents surface that describe the world from
  outside itself (maintenance logs, versioning notes, apologies from
  something like an author). First taste of meta-awareness.
- *Reach:* one movement rule softens (e.g. a fall that should kill you
  doesn't, once, in a marked place). The player learns cracks are *usable*.

**Threshold 2 — The Breach**
- *Reveal:* the decay is systemic, and it is *old* — lore leaks from
  Threshold 1 date the first cracks to long before the player existed. But
  it is now accelerating, and crossing thresholds is what accelerates it.
  The player learns they didn't break the world — they are what its slow
  death sped up for.
- *Decay:* structural — whole rooms de-render and re-render wrong; NPCs
  occasionally address the player's *previous run*.
- *Leakage:* **spatial leaks.** Out-of-bounds becomes canonical space. Places
  visible-but-unreachable in Threshold 0/1 are now the main content: behind
  the skybox, under the floor, inside the walls. Old levels are re-explored
  through their own cracks (this is where the ladder pays back the loop —
  familiar space made strange).
- *Reach:* traversal limits lift — climb what was unclimbable, pass through
  what was solid *where it is decayed*. Decay becomes a navigable surface.

**Threshold 3 — The Overclock**
- *Reveal:* the world was built to contain something, and the containment is
  what's failing. (Whether that something is the player is left open here.)
- *Decay:* causal — cause and effect desynchronize. Doors open before they're
  touched; enemies die a beat before they're hit.
- *Leakage:* **mechanical leaks.** Verbs stack past their design limits:
  cooldowns skippable inside decayed zones, momentum preserved through
  transitions, abilities usable in states that used to forbid them. This is
  the "use the mechanics to a higher degree" threshold — the player performs
  like a speedrunner exploiting the game, except it's canonical.
- *Reach:* the game stops enforcing sequence. Soft gates everywhere; almost
  any order is survivable if the player is skilled.

**Threshold 4 — The Naked Engine**
- *Reveal:* full meta-awareness. The character knows what the player knows.
  The remaining question is not "what is this world" but "what do we do with
  what's left of it."
- *Decay:* total. Intact space is now the *rare* biome — pockets of the old
  world preserved like museum dioramas, and visiting them feels like grief.
- *Leakage:* **authorial leaks.** The player reads and touches the level
  design itself — annotations, cut content, the scaffolding. Lore documents
  here recontextualize *everything* found at lower thresholds.
- *Reach:* effectively unbound. The final challenge is not overcoming rules
  but choosing an ending in a space that no longer imposes any — which is
  the ouroboros question: bite down (loop again, NG+ as Threshold 0 with
  retained awareness) or let go.

## 4. How thresholds are crossed (gating)

- **Hard gate, soft path.** Each threshold crossing is a deliberate,
  irreversible narrative event (a hard gate) — but the *route to it* is soft:
  the player must find and use N leaks of the current class to destabilize
  the world enough for the next crossing to exist. This makes the crossing
  feel earned and self-inflicted.
- **Knowledge gates over key gates.** Prefer La-Mulana / Outer Wilds gating:
  what blocks the player is what they don't yet *know or can't yet perceive*,
  not a missing inventory item. A leak the player hasn't learned to read is
  invisible; once read, it was "always there." This makes replays and NG+
  rich — the world was never actually hiding anything.
- **Attention is an accelerant (patch P1).** Decay escalation is not purely
  on the world's clock: *deliberate observation advances it.* Watching a
  misbehaving surface, lingering at a seam, returning to a symptom — these
  provoke the next beat sooner. A naive player never notices the rule and
  gets the ambient pacing; an aware player who knows where to look and that
  looking matters can drag a crossing forward by days. This is what makes
  the knowledge gates real (and the NG+ speedrun claim true): meta-awareness
  is the corrosive agent, and looking hard at the world is what cracks it.
  Every threshold's escalation beats must specify their attention hooks.
- **No going back, plenty of going down.** Crossing a threshold decays the
  world permanently for that run. Lower-threshold content isn't locked away —
  it's *transformed*, and revisiting it through new leakage classes is the
  main form of backtracking.

## 5. Leakage as an economy

Leakage is the unified reward system. Every leak the player finds is one of:

| Type | Player gets | Feeds |
|---|---|---|
| **Lore leak** | a document, a scene, a contradiction | narrative / meta-awareness |
| **Spatial leak** | a place they couldn't go | exploration / mastery of old space |
| **Mechanical leak** | a rule they can now break | expression / skill ceiling |

Rules of the economy:

- Leaks are **diegetic**: found in-world, never granted by menu or level-up
  screen. The "level up" *is* the threshold crossing.
- Leaks are **class-gated by threshold**: a Threshold-3 mechanical leak can be
  *seen* (and coveted) at Threshold 1 but not used. Visible-but-unusable
  leakage is the primary long-range motivation hook.
- Leaks are **load-bearing for the crossing**: some quota (or specific
  keystone leaks) must be exploited to open the next threshold, so the reward
  loop and the progression loop are the same loop.

## 6. Why this preserves NG+ instead of replacing it

The existing new-game/new-game-plus concept becomes the *outer coil*:
finishing Threshold 4 and choosing to loop restarts the run at Threshold 0,
but meta-awareness (the player's, and optionally the character's) persists.
Because gating is knowledge-based, an NG+ run naturally speedruns the ladder —
which fits the fiction: an aware entity moving through an intact world cracks
it faster. Each full loop can also raise a persistent **loop count** that
seeds slightly different lore leaks, so the ouroboros never eats *exactly*
the same tail twice.

## 7. Player-experience checkpoints (how we know it's working)

- At every threshold the player should be able to answer, unprompted: *what
  just became possible that wasn't before?* If they can't, the crossing is
  underweighted.
- The player should notice each new decay symptom **before** the character
  comments on it. If dialogue is doing the revealing, re-stage the symptom.
- Somewhere in Threshold 2–3, the player should do something that feels like
  cheating and then discover the game expected it. That moment is the
  signature feeling of the whole architecture.
- Returning to a Threshold-0 area at Threshold 3+ should provoke both power
  ("I own this space now") and loss ("it used to be whole"). If it only
  provokes power, decay is reading as cosmetic.

## 8. Decided: the player both discovers and causes the decay

**Director decision (2026-07-02):** the decay pre-exists the player *and* the
player's advancement accelerates it. A hybrid only muddies the theme if the
two halves blur together, so we keep them clean by separating them in **time**
and in **kind**:

- **Separated in time (two distinct beats).** Threshold 1 is the pure
  discovery beat: the world was already cracking, the player is innocent, the
  feeling is dread. Threshold 2 is the pure causation beat: crossings
  accelerate the decay, the player is complicit, the feeling is weight. Never
  deliver both in the same reveal — each gets its own threshold so each lands
  at full strength.
- **Separated in kind (two decay rates).** The world's own decay is a slow
  ambient drift — background symptoms that worsen gradually and would
  continue without the player. The player's contribution is **step-change**:
  every threshold crossing (and every keystone leak exploited) visibly
  ratchets the decay state. Ambient drift creates dread ("this ends with or
  without me"); player-driven steps create agency and cost ("and I am
  choosing to hurry it"). The player can always tell which decay they caused,
  because theirs arrives as a lurch, not a slide.
- **The thematic payoff.** By Threshold 4 the question "did I do this?" has a
  precise answer: *no, and yes.* The world was always going to die; the
  player chose to be present for it — chose to make their capability out of
  its death. That is the ouroboros bargain, and it's what makes the final
  loop-or-let-go choice mean something: looping again means feeding on the
  world's decline again, knowingly.

## 9. Open questions

1. **Threshold count and pacing** — five is a reference shape; the right
   number depends on total playtime and how much content each decay state
   needs.
2. **Character meta-awareness in NG+** — does the *character* remember loops,
   or only the player? Character memory enables dialogue payoffs but costs us
   the ability to replay early sincerity.
3. **Failure state under decay** — what does death/failure mean at Threshold
   3–4 when the world barely enforces rules? (Candidate: failure feeds the
   ambient drift — a slide, not a lurch, so it reads as the world claiming
   you rather than you spending it.)
4. **Scope control** — spatial leaks (Threshold 2) mean building canonical
   out-of-bounds space for existing levels. That is close to doubling level
   art surface. Mitigation: decayed space can be *cheaper* than intact space
   by design (unlit, untextured, scaffold-styled) — the aesthetic of the
   naked engine is an asset budget, not just a theme.
