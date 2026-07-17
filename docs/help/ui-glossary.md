---
type: reference
status: active
last_touched: 2026-07-11
classification: business
project: nexus-product
---

# UI glossary — the words you'll see in Nexus

Plain-language definitions of everything in the Nexus interface. Cross-links: concepts behind these
terms live in the [agentic-systems glossary](agentic-glossary.md); repo/Git terms in the
[GitHub glossary](github-glossary.md).

## The core surfaces

**Brain** — The model that runs your conversation and directs the work. You talk to the Brain. It can
answer directly or convene the Council. Any model you've connected can be the Brain. → concept:
[orchestrator](agentic-glossary.md).

**Council** — A group of models convened to answer one question together. Each member responds, and the
Brain reads them all and synthesizes a single grounded reply. You can watch each member's turn. Use it
when one opinion isn't enough.

**Council modes** — How the members collaborate: **Roundtable** (each answers independently),
**Debate** (they respond to each other), **Orchestrator** (the Brain assigns and directs sub-tasks).
Start with Roundtable.

**Council inspector** — The side panel that shows a Council run live: which member is working, each
member's turn, and how the final answer was synthesized. It makes the Council transparent rather than a
black box.

**Unit picker** — The controls near the message box for choosing your Brain (local model) and adding
cloud models to the Council. The picture shows a brain, your local model, and a bubble of cloud models.

## Your work

**Vault / workspace** — The folder Nexus works on: your project, notes, or knowledge base. Often a
tracked repository. Connect it in Settings. "Vault" just means "the folder Nexus reads and works in."

**Repository (repo)** — A folder whose change history is tracked (usually with Git). Recommended for
agent work because every change is recorded and reversible. → [GitHub glossary](github-glossary.md).

**Canon** — Your workspace's source-of-truth documents — the material you've marked as authoritative.
Nexus can ground answers in your canon so the models work from your facts, not guesses.

**Status log** — A running record of what's happened in your workspace (decisions, escalations, work
logged). It's how you and your agents keep a shared history.

**Knowledge** — The view for browsing the documents and context available to your models.

**Agents** — The view listing the agents in your system, their roles, and their posture (how active
each one is). → concept: [agent](agentic-glossary.md), [registry](agentic-glossary.md).

**Domains** — Optional areas your project is organized into (e.g. separate streams of work), each with
its own goals and activity.

## Models, cost, and capability

**Model** — An individual AI you've connected (from a provider, or a local one). → [agentic
glossary](agentic-glossary.md).

**Provider** — The service a model comes from (you connect it with your own API key). Nexus doesn't
resell usage — you bring your own.

**Local model** — A model running on your own computer, so nothing leaves your machine. Slower/cheaper
depending on your hardware; maximally private.

**Cost meter** — The live readout of estimated spend, per session and per model. Prices are estimates
you can confirm/refresh in Settings. Local models show $0.

**Availability** — Whether a model is reachable right now. Green = ready; **amber** = reachable but slow
to respond; red = unavailable (bad/missing key, no balance, etc.). An amber model is still selectable.

**Capabilities** — The powers a model can be granted beyond chatting: **tools** (run commands, read/
write files), **connectors (MCP)** (plug in external services), and **computer use** (screen control).
All ship **off**; you enable them deliberately. → [agentic glossary](agentic-glossary.md).

**Sandbox** — The guarded space where tool actions run. It ships **disabled** and **fail-closed**
(nothing runs unless you turn it on and approve it). When on, it confines what a tool can touch.

**Per-command approval** — When the sandbox is on, a model asking to run something pauses for your
explicit yes/no, so no command runs behind your back.

**Approval broker** — An optional advanced setting where a second, independent model can auto-approve
only *trivial, safe* pending actions (everything else still asks you). Off by default; you choose the
reviewer model and the rules.

## Personalization

**Accent** — The color that highlights the interface. Pick one in Settings.

**Theme** — A full interface look (colors, typography, shape). Nexus ships prepackaged themes (e.g.
retro/8-bit, cyberpunk, parchment) and lets you build your own. The default look is unchanged until you
choose a theme. *(Availability depends on your Nexus version.)*

**Console name** — The name shown in the sidebar for your Nexus. Make it yours.

## Onboarding & help

**Onboarding / first-run tutorial** — The guided flow that greets you the first time you launch and
introduces the ideas above. Reachable again anytime from Help.

**Help** — This support set: the roadmap and glossaries, available from the sidebar whenever you want
them.
