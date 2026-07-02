# OuraBoris — Paper Playtest: Can Ouroboros Reach Threshold 2?

**Status:** Playtest report / rules stress-test
**Origin:** Director request, 2026-07-02 — "I want Ouroboros to try and
reach this new threshold. See if it can access level 2."
**Rules under test:** `docs/ouraboris/level-design.md` +
`docs/ouraboris/scenes/mirror-self-breach.md`, applied strictly as written.

---

## 0. Method

Two runs, same rules, no house rulings — where the docs are silent, the run
**stalls** and the stall is logged as a finding.

- **Run A — the naive player.** First loop, no meta-knowledge. Control run:
  does the intended experience actually assemble itself in play?
- **Run B — OUROBOROS.** The loop-aware entity: an NG+ player carrying full
  knowledge of the script, the Sharer, and the ladder. Per the level-design
  doc's own claim ("an NG+ run naturally speedruns the ladder — an aware
  entity moving through an intact world cracks it faster"), Ouroboros
  *should* be able to reach Threshold 2 fast. Test: can it?

## 1. Run A — naive player (control)

**T0, the Intact World.** Player bikes the daily loop, plays the game's
baseline verbs. Sees the one visible-untouchable crack. So far so good.

> **STALL — Finding F1.** How does Run A cross Threshold 0 → 1? The ladder
> defines T0 and T1 as states, and defines the T1→T2 crossing as the train
> scene — but **no crossing event from 0 to 1 is specified anywhere.** The
> run cannot proceed without a house ruling. (Ruled for playtest purposes:
> T1 begins when the first §3 mirror beat fires. But that makes 0→1 a thing
> that *happens to* the player — no gate, no accomplishment, no
> level-1-to-level-2 feeling. The ladder's first rung is missing.)

**T1, the First Seam.** The §3 beats land along the ride route in order:
lag, hold, habit, mouth, vacancy. Player notices around beat 2–3 (the
*hold* is the designed first unmissable). Lore leaks surface. Vacancy
holds for days. Chain snaps. Last train. The scene fires.

Player answers at dialogue point 1 ("What are you?") — **crossing achieved.**
Ghost station, Threshold 2 begins.

> **Note — Finding F2.** Run A crossed *without reading a single lore
> leak.* The level-design doc says crossings require exploiting N leaks of
> the current class ("leaks are load-bearing for the crossing"); the scene
> doc never enforces it. As written, the train scene fires on the world's
> clock regardless of what the player found. The reward economy and the
> hard gate are not actually connected for T1→T2.

**Run A verdict:** reaches Threshold 2, and the experience mostly assembles
as designed — but it would reach it identically having ignored every leak
in the game. The soft path isn't load-bearing.

## 2. Run B — OUROBOROS (loop-aware)

Ouroboros spawns at T0 with complete knowledge: it knows the mirror will
misbehave, knows the Sharer by name, knows the chain will snap, knows that
*speaking is the crossing.* Per the gating rules ("what blocks the player
is what they don't yet know or can't yet perceive"), nothing should block
an entity that knows and perceives everything.

**Attempt 1 — go straight to the glass.** Ouroboros rides to the nearest
shop window and stares, waiting for the lag. The §3 beats are written as a
fixed escalation "spread across Threshold 1" on the world's schedule.
Staring does nothing. **The beats cannot be provoked.** Ouroboros knows
exactly what will happen and has no way to make it happen sooner.

**Attempt 2 — force the train.** Ouroboros skips the bike and rides the
last train nightly from day one, window seat, waiting. The scene requires
the vacancy state (§3.5), which requires beats 1–4, which are on the
ambient-drift clock. The glass dutifully reflects Ouroboros every night.
**Nothing to talk to.**

**Attempt 3 — speak first.** Ouroboros addresses its own reflection aloud:
"I know you're behind on the account. Come out." As written, the docs
define speaking-as-crossing only *inside* the scene, after the Sharer
resumes. A player-initiated conversation has no rules support. Stall.

**Attempt 4 — break the bike.** Ouroboros snaps its own chain to trigger
the scene's precondition. The chain snap is staged as ambient drift, a
world event — player-inflicted damage has no listed effect on scene firing.
Stall.

> **STALL — Finding F3 (the big one).** Ouroboros **cannot reach Threshold
> 2 one minute faster than the naive player.** Every precondition of the
> crossing — the §3 beats, the vacancy, the chain snap, the Sharer's
> approach — sits on the world's clock, and knowledge touches none of them.
> The T1→T2 crossing is a **calendar gate wearing a knowledge gate's
> clothes.** This directly contradicts the level-design doc's NG+ promise
> (aware entities crack the world faster) and its own gating pillar
> (knowledge gates over key gates). The outer coil — the whole ouroboros —
> doesn't turn on this rung.

**Run B verdict:** **Threshold 2 reached — but not accessed.** Ouroboros
gets there on schedule, like a passenger, not like an ouroboros. Denied by
the clock, not by design intent.

## 3. Findings summary

| # | Severity | Finding |
|---|---|---|
| F1 | High | No Threshold 0→1 crossing exists. The ladder's first rung is undefined; T1 currently just *happens*. |
| F2 | High | Lore leaks aren't load-bearing for the T1→T2 crossing — the scene fires regardless, disconnecting the reward economy from the gate. |
| F3 | Critical | The T1→T2 crossing is time-gated, not knowledge-gated. A fully-aware player can't accelerate it at all, breaking the NG+ speedrun promise and the gating pillar. |
| F4 | Low | Player-initiated speech to reflections has no defined behavior (Attempt 3). Currently a dead input; it's also the most obvious thing an aware player will try. |

## 4. Patches — **APPROVED & APPLIED (Director, 2026-07-02)**

All four patches below are now folded into the level-design doc (P1 → §4
gating, P4 → Threshold 0 entry) and the scene doc (P1 → §3 pacing rule and
per-beat attention hooks, P2 → §3.5 vacancy gate, P3 → §6 speak-first
variant with scripted opening). F1–F4 are resolved.

**P1 (fixes F3, F1's spirit): attention accelerates the drift.** Make
*observation* a decay accelerant: deliberately watching reflective surfaces
advances the §3 escalation. A naive player gets the beats at the ambient
pace (unchanged experience); an aware player who stares the world down
provokes them in days. Thematically exact — meta-awareness is the corrosive
agent, looking hard at the matrix is what cracks it — and it makes the
knowledge gate real: what speeds you up is knowing *where to look and that
looking matters.*

**P2 (fixes F2): lore leaks gate the vacancy.** Beat §3.5 (the vacancy)
requires K lore leaks read — the Sharer can only step fully out once the
player has read enough of the world's "account" to hold it. This makes
leaks load-bearing as the level-design doc promises, and gives the Sharer's
"I kept the account" line mechanical teeth.

**P3 (fixes F4, and gives NG+ its signature moment): speaking first
works.** If the player addresses a misbehaving reflection aloud at beat 3+,
the scene can fire early, off-train, wherever they are — with a variant
opening: the Sharer, addressed first, is *thrown*. The one thing it cannot
do is resume a conversation the other side started. An NG+ run earns a
rattled Sharer and a faster ladder; a first-loop player will almost never
find this. (Deferral rules unchanged; silence still defers.)

**P4 (fixes F1): define the 0→1 crossing.** Smallest viable version: T1
begins when the player *touches the one visible crack* T0 shows them — a
deliberate act, hard gate, self-inflicted, consistent with every other
crossing. Until touched, the §3 beats never start. This gives the first
rung the same shape as the rest of the ladder.

## 5. Answer to the Director

**Can Ouroboros access level 2?** Under the original rules: it could
*arrive* — the scene fires, the answer crosses, the ghost station opens —
but it could not *access* it in any meaningful sense, because nothing it
knew or did moved the date. The world let it in; it didn't break in.

**Post-patch re-run (P1–P4 applied):** Ouroboros touches the visible crack
on day one (P4 — Threshold 1 opens immediately), reads the three nearest
lore leaks while staring down every surface on the ride route (P1 — beats
1–4 provoked in days, P2 — vacancy gate met), then addresses the empty
glass aloud (P3) and takes the crossing on its own initiative, off-train,
with a rattled Sharer. **Access achieved — by knowledge, not by calendar.**
The naive player's experience is untouched. The rung holds; the coil turns.
