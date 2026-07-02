# OUROBOROS — Writer's Brief

*A one-sitting primer for someone joining the brainstorm. Everything decided so
far, everything still open, no prior context required.*

> **Canon note:** the living design docs are in `GTVGoose/goose-agent-system`,
> branch `ouroboros/design-bible-v1`, folder `ouroboros/`. This brief is a
> derived summary (snapshot 2026-07-02) — if it disagrees with the design bible,
> the bible wins.

---

## 1. The pitch

**Ouroboros** (formerly *OuraBoris*) is a game about a world that is quietly
dying — and a player whose progress feeds on its death.

The world presents as whole: a small, lived-in place where the player character
(a goose — one who beatboxes, more on that later) rides a bike to work every
day. But the world is a construct, and it's decaying. Cracks appear. Things
leak through them. The core inversion: **instead of restoring a broken world,
the player's exploration exposes the breakdown, and their advancement
accelerates it.** Every step up the power ladder is a step down the world's.

The title is the thesis: a snake eating its own tail. Even the title screen
plays it — the ouroboros ring *is* the loading bar; the game opens by forming
the loop.

## 2. The architecture — the Threshold Ladder

Progress happens in **thresholds** — five numbered strata (0–4). Crossing one
is the "level 1 to level 2" experience, and every crossing changes four things
at once:

| Layer | The question |
|---|---|
| **Narrative reveal** | What does the player now understand about the world? |
| **Decay state** | What has visibly broken since last time? |
| **Leakage class** | What new kind of crack can be exploited? |
| **Mechanical reach** | What old limit on an existing move is gone? |

The ladder at a glance:

- **T0 — The Intact World.** Everything looks fine. One visible crack exists,
  untouchable-seeming. **Touching it is the first crossing** — deliberate,
  self-inflicted, like every crossing after it.
- **T1 — The First Seam.** Something is wrong *with the world, not with you*.
  Cosmetic glitches; **lore leaks** (documents describing the world from
  outside itself — maintenance logs, apologies from something like an author).
  One movement rule softens, once, in a marked place.
- **T2 — The Breach.** The decay is systemic and *old* — it predates the
  player — but crossings are accelerating it. **Spatial leaks:** out-of-bounds
  becomes canonical space. Behind the skybox, under the floor, inside the
  walls. Familiar places re-explored through their own cracks.
- **T3 — The Overclock.** The world was built to *contain* something, and the
  containment is failing. Cause and effect desync. **Mechanical leaks:** verbs
  stack past their limits — the player performs like a speedrunner exploiting
  the game, except it's canonical.
- **T4 — The Naked Engine.** Full meta-awareness; the character knows what the
  player knows. Intact space is the rare biome now — pockets of old world like
  museum dioramas, and visiting them feels like grief. **Authorial leaks:**
  the player reads the level design itself. Final choice: bite down (loop
  again — NG+ restarts at T0 with awareness kept) or let go.

**Four design pillars hold it together:**

1. **Decay is progress.** The world's death and the player's growth are the
   same curve.
2. **Leakage is the reward currency.** Nothing is granted by menu; every
   reward is *found in a crack* (lore / spatial / mechanical). Leaks are also
   load-bearing — you must exploit some to open the next crossing, so the
   reward loop and the progression loop are one loop.
3. **Meta-awareness is earned, one step per threshold.** The player should
   always be slightly ahead of the character — noticing the glitch before the
   character mentions it — so reveals land as *confirmation*, never exposition.
4. **Mechanics deepen instead of multiplying.** No new verbs at higher
   thresholds; the rules limiting old verbs are removed. The move you learn at
   T0 is the move you break the game with at T4.

## 3. The mechanics that make it tick

- **Hard gate, soft path.** Every crossing is a deliberate, irreversible act
  the player chooses — but the *route* there is earned by finding and using
  leaks.
- **Knowledge gates, not key gates** (La-Mulana / Outer Wilds school). What
  blocks you is what you don't yet know or can't yet perceive — never a
  missing item. The world was never actually hiding anything.
- **Attention is an accelerant.** Deliberately *watching* the world's symptoms
  — staring at a misbehaving reflection, returning to a seam — provokes the
  next decay beat sooner. A naive player never notices the rule; an aware
  player can drag a crossing forward by days. Looking hard at the matrix is
  what cracks it.
- **No going back, plenty of going down.** Crossings decay the world
  permanently for that run. Old areas aren't locked — they're *transformed*,
  and re-entering them through new leak classes is the main backtracking.
- **NG+ is the outer coil.** Because gates are knowledge, an aware second run
  naturally speedruns the ladder — which fits the fiction: an aware entity in
  an intact world cracks it faster. A persistent loop count seeds slightly
  different lore each cycle, so the snake never eats exactly the same tail
  twice.

**One decided nuance worth internalizing** (it's the theme's spine): the decay
is both *discovered* and *caused*, kept clean by separating the two —

- **In time:** T1 is the pure discovery beat (the world was already cracking;
  you're innocent; the feeling is dread). T2 is the pure causation beat
  (crossings accelerate it; you're complicit; the feeling is weight). Never
  both in one reveal.
- **In kind:** the world's own decay is a slow ambient *slide*; the player's
  contribution is always a visible *lurch* (each crossing ratchets it). The
  player can always tell which decay is theirs, because theirs arrives as a
  lurch.
- **The payoff:** by T4, "did I do this?" has a precise answer — *no, and
  yes.* The world was always going to die; the player chose to make their
  capability out of its death. That's the ouroboros bargain, and it's what
  makes loop-or-let-go mean something.

## 4. The story so far — what's actually written

### The daily loop (Threshold 0–1)

The player character bikes a daily commute. The world's first symptoms live on
the surfaces a cyclist passes: shop glass at speed, puddles at intersections,
dark office windows. Reflective surfaces are canonically **the first systems
to fail** as the world decays — every mirror is a room, and the decay is
closing the rooms.

After the player touches the visible crack (the 0→1 crossing), the mirror
beats escalate in order:

1. **The lag** — your reflection runs a few frames behind. Deniable.
2. **The hold** — you turn away; in a second surface, it's still facing you.
3. **The habit** — it does something you habitually do, *before* you do it.
4. **The mouth** — it speaks, no audio. Lip-readable from a second angle:
   *"soon."*
5. **The vacancy** — the mirror shows the room correctly, without you in it.
   From here, no surface in the world carries you. (Gated: this can't fire
   until you've read enough lore leaks — the working number is 3.)

Each beat fires on the ambient clock *or sooner if provoked by staring* —
attention-as-accelerant in action.

### The Sharer, and the night train (the T1→T2 crossing)

The centerpiece scene so far. The player's reflection — gone from every
surface for days — turns up **in person**, and the first real conversation
with it *is* the crossing into Threshold 2.

Its voice bible is Joseph Conrad's *The Secret Sharer* (its canon working name
is **the Sharer**). The register: it whispers; it never starts conversations,
only *resumes* them ("from its side, you've been talking your whole life");
it is unnervingly calm and reasonable; it confesses without excusing; it asks
for shelter, not rescue — *don't give me back.* It says "surface," never
"mirror." It slips into "we." It describes your inner life in the past tense,
as fact.

The staging: the commute breaks — the bike chain snaps, a too-clean break that
*feels* arranged (whether the Sharer can steer the drift is deliberately
unanswered). Forced onto the last train, the player sits at a dark window that
reflects the whole car except them. Tunnel; lights stutter; the seat opposite
is occupied. First line:

> *"You noticed the lag in the spring. You said nothing — not to anyone, not
> even in the way people say things to themselves. That was kind of you. I've
> been wanting to thank you for that."*

The conversation is paced in train stops (the clock is the route strip above
the doors). Mid-scene it delivers the complicity reveal, as fact, not
accusation: *you didn't break the world — but it is quickening, and it
quickens around you.* Then the ask: *"Don't give me back."*

**Speaking is the crossing.** Any voiced reply crosses; only silence — getting
off the train — defers (no fail state; the Sharer re-finds you on another
surface later and resumes as if no time passed). On the crossing: every window
in the car cracks *from the inside*, and the train stops hard at **a station
that is not on the route strip** — an unlit ghost platform, the first
canonical out-of-bounds space of Threshold 2. The Sharer steadies the bike
before it falls — "a small, domestic, terrible courtesy" — and steps out:

> *"Come and see the back of the room. I know the way. I know the backs of
> everything."*

From here the Sharer persists as the player's guide to out-of-bounds space —
it has lived behind every surface in the world. Walking the dead bike through
the backs of things is Threshold 2's opening body language; fixing the chain
marks the player accepting the new commute — *between* worlds, not across town.

**The NG+ signature moment:** an aware player can speak to the glass *first*.
The Sharer, addressed first, is *thrown* — the one thing a creature built on
resuming cannot do is enter a conversation the other side started. It recovers
in a line or two, but the crack shows, and it never quite forgives the
discourtesy.

### The playtest (how we pressure-test design)

We ran a paper playtest: two runs of the T0→T2 rules exactly as written, no
house rulings. Run A: a naive first-loop player. Run B: **Ouroboros itself** —
a loop-aware entity with full knowledge, testing the claim that awareness
speedruns the ladder. Result: the naive run mostly worked, but the aware run
**couldn't reach Threshold 2 one minute faster than the naive one** — every
precondition sat on the world's clock. "A calendar gate wearing a knowledge
gate's clothes." That finding produced four approved patches (all folded into
canon): the 0→1 crack-touch crossing, attention-as-accelerant, the lore-leak
gate on the vacancy, and the speak-first variant. Post-patch re-run: access
achieved by knowledge, not calendar. *This loop — design, adversarial
playtest, patch — is how the project works, and new ideas from this brainstorm
will get the same treatment.*

## 5. Craft rules in force

- **Write mechanics like lockpicking, not like magic.** House style rule born
  from the goose's beatboxing reading as vague gesture: *name the sound, show
  the mechanism, earn any poetry with concrete detail first.* There's a full
  sound vocabulary (kick /B/, inward K-snare /K^/ — how beatboxers breathe
  mid-pattern), loopstation grammar (closing the loop a hair late means the
  bar limps forever — punch-in timing is characterization), and a rule that
  breath management is where performance drama lives. The goose's honk is
  reserved as a once-per-performance signature drop, never a running gag.
- **Player before character.** Stage every symptom so the player notices it
  before any dialogue names it.
- **The signature feeling** (the checkpoint we test against): somewhere in
  T2–T3 the player should do something that feels like cheating and then
  discover the game expected it.
- **Decay must read as loss, not just power.** Returning to a T0 area late
  should provoke both "I own this space now" and "it used to be whole."
- **Decayed space is an asset budget, not just a theme.** Out-of-bounds can be
  cheaper than intact space by design — unlit, untextured, scaffold-styled.

## 6. Where a fresh brain helps — the open questions

This is the brainstorm menu. All genuinely undecided:

1. **Threshold count & pacing.** Five is a reference shape. How long is a
   loop, and how much content does each decay state deserve?
2. **Does the *character* remember loops in NG+, or only the player?**
   Character memory buys dialogue payoffs; it costs replaying early sincerity.
3. **What does failure mean at T3–T4**, when the world barely enforces rules?
   (Current candidate: death feeds the ambient drift — a slide, not a lurch,
   so it reads as the world claiming you rather than you spending it.)
4. **The Sharer's endgame.** Conrad's ending — the double released, "a proud
   swimmer striking out for a new destiny" — wants to land at T4. Does the
   player release the Sharer into what's left of the world, merge with it, or
   take its place behind the last surface? The answer decides how much warmth
   to write into it from here on.
5. **Can the Sharer steer the drift?** (Did it snap the chain?) Currently
   deliberately unanswered — it keeps the Sharer trustworthy-but-uncanny. If
   ever answered, it should be late (T3+), and it changes the ethics of the
   shelter the player granted.
6. **Mirror beats: scripted or systemic?** Fixed beats along the bike route
   (cheap, has a natural spine) vs. a reflection-state layer on every surface
   (stronger, expensive).
7. **Threshold 2's scope problem.** Canonical out-of-bounds for existing
   levels is close to doubling level art surface. The naked-engine aesthetic
   mitigates — how far can we push it?
8. **The later Sharer encounters.** Five staged locations are on file for it
   to resume in (barbershop after hours, bathhouse at closing, flooded
   underpass, shop window at dusk, the childhood bathroom mirror). Which, in
   what order, saying what?

---

*Source docs (canon home: `goose-agent-system` → `ouroboros/`):
`level-design.md` (the ladder), `scenes/mirror-self-breach.md` (the train
scene), `style/beatbox-writing.md`, `ui/title-screen.md` + prototype,
`playtests/reports/2026-07-02-paper-run-threshold-2.md`.*
