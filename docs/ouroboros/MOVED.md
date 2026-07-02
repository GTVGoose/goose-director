# MOVED — do not edit Ouroboros design here

**Everything in `docs/ouroboros/` was migrated on 2026-07-02** (commit `a6d2667` in the
game repo) to the Ouroboros game's own repository, which is the single canonical home
for all Ouroboros design and code:

> **GTVGoose/goose-agent-system** · branch `ouroboros/design-bible-v1` · folder `ouroboros/`
> (locally: `/Users/goose/Documents/goose-agent-system/ouroboros/`)

Where each file went:

| Here (stale) | Canonical location |
|---|---|
| `level-design.md` | `ouroboros/level-design.md` |
| `scenes/mirror-self-breach.md` | `ouroboros/scenes/mirror-self-breach.md` |
| `style/beatbox-writing.md` | `ouroboros/style/beatbox-writing.md` |
| `ui/title-screen.md` | `ouroboros/ui/title-screen.md` (spec now **implemented** in `ouroboros/game/`) |
| `prototypes/title-screen/index.html` | `ouroboros/prototypes/title-screen/index.html` |
| `playtests/paper-run-threshold-2.md` | `ouroboros/playtests/reports/2026-07-02-paper-run-threshold-2.md` |

**Why this note exists:** this repo (goose-director) is the director dashboard app —
React/Vite/Electron. It contains no Ouroboros game code. Design docs written here in
2026-07 were invisible to the actual game until they were manually ported. If you are an
agent (or a human) working on Ouroboros: **make all changes in goose-agent-system, not
here.** This branch is kept only as historical record and can be deleted.
