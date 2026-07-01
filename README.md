# Goose Director Console

Local visibility dashboard for the Goose Agent System. Shows agent posture, Director Status Layer entries, and canon state — live from your repo.

## Setup

**1. Configure your repo path**

Edit `goose.config.json`:

```json
{
  "repoPath": "/Users/goose/path/to/your/goose-agent-system"
}
```

If the repo isn't found, the app uses static data so you can still see the UI.

**2. Install dependencies**

```bash
cd goose-director
npm install
```

**3. Run**

```bash
npm run dev
```

This starts both the API server (port 3001) and the Vite dev server (port 5173). Open [http://localhost:5173](http://localhost:5173).

## What it shows

| View | Contents |
|---|---|
| Dashboard | Agent posture summary, top status entries, canon snapshot |
| Agents | Full agent map grouped by posture (Active / Passive / Recursive) |
| Knowledge | Full-text searchable index of all repo docs, plus saved thread records |
| Status Layer | All Director Status Layer entries, sorted by urgency |
| Canon State | All source-of-truth docs with Canon Status and Boundary |
| Invoke | Multi-model relay: pick an agent role, attach source docs, send to any model, chain responses |

### Invoke panel features
- **Model picker** — Claude Sonnet/Haiku, GPT-4o, or local Ollama model
- **Agent role** — Watcher, Adversary, Angel, Choreographer, Inception, Bibliographer, or open Director
- **Source doc picker** — select canon docs to attach as context; the model reads them before responding
- **Route to** — send any response directly to a different model with one click
- **Save thread** — saves the conversation to the Knowledge Navigator as a searchable record

### Thread TOC
Every conversation in Invoke has a persistent TOC sidebar (click "TOC" button). It:
- Auto-indexes each response the moment it arrives (no API call, no waiting)
- Shows title, tag type (Code / File / Decision / Question / Flag), and word count
- Click any entry to jump to that message instantly
- "Ask Bibliographer" button triggers the Bibliographer agent to produce a structured Thread Record

### Knowledge Navigator
Searchable, filterable index of everything in your repo:
- Filter by document type, canon status
- Click any document to see metadata and excerpt in a detail pane
- Saved threads from Invoke sessions live here too

## Data sources

The app reads directly from your goose-agent-system repo:
- `agents/*/AGENT.md` — agent type, posture, canon fields
- `DIRECTOR_STATUS.md` — status layer entries
- `docs/source-of-truth/*.md` — canon state
- `registry/agents/*.yaml` — structured agent data (Watcher)

If `DIRECTOR_STATUS.md` is not in the repo, it falls back to the workspace copy.

## Roadmap

- [ ] Watcher charter Posture field live-edit (inline in Agents view)
- [ ] Source bundle export — select docs + thread record → download as .md bundle for Codex
- [ ] Session auto-save — option to auto-save every Invoke session at close
- [ ] Ollama model auto-detect — pull available models from Ollama at startup
- [ ] Agent invoke history — see previous Invoke sessions per agent role

## Stack

- React 18 + Vite (frontend)
- Express (local API, reads repo files)
- No database — all data comes from the repo on disk
