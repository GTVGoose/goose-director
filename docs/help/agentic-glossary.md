---
type: reference
status: active
last_touched: 2026-07-11
classification: business
project: nexus-product
---

# Agentic-systems glossary — the concepts behind AI agents

No background assumed. These are the general ideas that make AI *agents* different from a plain
chatbot. They apply anywhere, not just in Nexus — this is literacy you can carry to any tool. Where a
term shows up in the Nexus interface, the [UI glossary](ui-glossary.md) says what it looks like.

## The building blocks

**Model (LLM)** — A large language model: an AI trained to predict and generate text. It's the raw
engine — smart but stateless. On its own it answers a question and forgets it. Everything below is about
giving a model the things it lacks: memory, a workspace, and a goal.

**Prompt** — What you send the model: your instruction or question. "Prompting" is the craft of asking
clearly. A **system prompt** is standing instructions that shape how the model behaves across a whole
conversation.

**Context (context window)** — Everything the model can "see" at once: your prompt, the conversation so
far, and any documents included. It's finite — a model has a maximum context size. Managing what goes
into context (relevant docs in, noise out) is a core skill.

**Token** — The unit models read and bill in — roughly a word-piece. Usage and cost are measured in
tokens (input + output). This is why a cost meter counts tokens.

**Inference** — One run of the model producing an answer. "An inference call" = one request/response.

## From model to agent

**Agent** — A model given a **goal**, some **memory**, and the ability to take **actions** (use tools)
across multiple steps — instead of just answering once. An agent can plan, act, observe the result, and
continue. The difference between "a smart autocomplete" and "a worker."

**Agentic system** — A setup of one or more agents, their memory, their workspace, and the rules that
coordinate them, all aimed at a goal. Building one is less about coding and more about *directing*.

**Memory layer** — Durable notes the agents keep between sessions: decisions, facts, context — usually
saved as files. Because models forget everything otherwise, memory is what lets a system *improve* over
time instead of resetting. Treating memory as a first-class part of the system (not an afterthought) is
the highest-leverage habit for a beginner.

**Tool / tool use (function calling)** — A capability that lets a model *do* something beyond text: run
a command, read or write a file, search, call an API. The model asks to use a tool; the system runs it
and returns the result. Powerful, so it should be gated and approved.

**MCP (Model Context Protocol)** — An open standard for plugging external services into a model as
tools — like a universal adapter for connectors. An "MCP server" exposes some capability (a calendar, a
database, a search engine) that a model can then use.

**Computer use** — The most powerful tool class: letting a model control a screen (move the cursor,
click, type) to operate software directly. Also the most risky, so it's the most heavily gated —
enable it last, if at all, and always with explicit consent.

**Sandbox** — A confined environment where tool actions run so a mistake or a bad instruction can't
reach the rest of your system. A good sandbox is **fail-closed**: it does nothing unless explicitly
turned on.

## Directing and coordinating

**Orchestration** — Coordinating multiple models or agents on a task: deciding who does what, in what
order, and how their outputs combine. The "conductor" role.

**Orchestrator / director / "brain"** — The agent (or you) that directs the others: sets the goal,
picks who weighs in, and judges the results. In Nexus this is the **Brain**.

**Council / ensemble** — Several models answering the same question so their outputs can be compared or
synthesized. More minds catch more mistakes; seeing them disagree is often how you get an answer you can
trust.

**Synthesis** — Combining several models' answers into one considered reply, rather than just picking a
winner.

**Roles** — Assigning agents specialized jobs (researcher, writer, reviewer, planner). Specialization
plus a clear registry keeps a growing team organized.

**Registry** — A simple record of your agents: who each one is, what it may do, and who it answers to.
It makes roles explicit and a team manageable as it grows.

## Judgment and safety

**Human-in-the-loop** — Keeping a person's approval in the path for consequential actions, so automation
augments your judgment rather than replacing it. Per-command approval is a human-in-the-loop control.

**Hallucination** — When a model states something false with confidence. Grounding answers in your own
documents (your canon) and using a council to cross-check are two ways to reduce it. Always verify
consequential claims.

**Grounding** — Tying a model's answer to real source material you provide, so it works from your facts
instead of guessing.

**Prompt injection** — A security risk where hostile text hidden in a document or web page tries to
give the model instructions. This is why tools are gated and why a model's inputs from the outside world
should be treated as data, not commands.

**Guardrails** — The limits and checks around an agentic system (sandboxes, approvals, allowlists,
budgets) that keep it safe to run. Good systems make the safe path the default.

---

**The through-line:** a plain model is a smart engine with no memory and no hands. An agentic system
adds memory, hands (tools), a goal, and a director's judgment — carefully, with the powerful parts off
until you choose them.
