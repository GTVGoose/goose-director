---
type: reference
status: active
last_touched: 2026-07-11
classification: business
project: nexus-product
---

# Getting started with Nexus — a roadmap for newcomers

You don't need to be a programmer to use Nexus. You need a goal, a folder to work in, and a
willingness to direct. This is the path from a fresh install to a system that grows with you. Take it
at your own pace — each step stands on its own.

If a word is unfamiliar, the glossaries have you covered:
[UI terms](ui-glossary.md) · [agent concepts](agentic-glossary.md) · [Git & GitHub](github-glossary.md).

---

## Step 0 — What Nexus is (and isn't)

Nexus is a **console for directing AI models** and building a small team of **agents** around a
project. It doesn't sell you AI usage — you connect the model providers you already have (with your own
API keys), or run a local model on your own machine. Nexus gives you a place to talk to those models,
have several of them collaborate, keep durable notes, and — when you're ready — let them take actions
safely.

Think of yourself as the **director**. The models are your team. Nexus is the studio.

---

## Step 1 — Connect your models

Open **Settings** and add the providers you want to use (your API keys stay on your machine). You can
also point Nexus at a **local model** if you'd rather nothing leave your computer. Any model can play
any role.

- **Tip:** start with one or two models you trust. You can add more anytime.
- The **cost meter** will estimate what each model costs as you go, so there are no surprises.

---

## Step 2 — Connect a workspace (a folder or repository)

Nexus works *on* something: a **folder** on your computer that holds your project — notes, documents,
code, a knowledge base, whatever you're building. Point Nexus at it in Settings (or during onboarding).

- A plain folder works to start.
- A **repository** (a folder whose history is tracked with **Git**) is better, because every change is
  recorded and reversible — which is exactly what makes it safe to let agents act. New to this? See the
  [Git & GitHub glossary](github-glossary.md); you can add Git to a folder later.
- Hosting the repo on **GitHub** adds a backup and a way to collaborate — optional, but recommended once
  you're comfortable.

---

## Step 3 — Talk to the Brain

The **Brain** is the model that runs your conversation and directs the work. Just start typing. Ask it
about your project, ask it to draft something, ask it to plan. Because it can see the folder you
connected, its answers are grounded in your actual material, not a blank slate.

This alone — a capable model that knows your context — is already useful. Many people live here for a
while before going further.

---

## Step 4 — Convene the Council when one opinion isn't enough

For a hard decision or a high-stakes draft, add more models and hand the turn to the **Council**:
several models answer in parallel, and the Brain reads them all and synthesizes one grounded reply. You
see each member's turn, so you can judge the reasoning, not just the verdict.

- Use it when the cost of being wrong is high, or when you want to see disagreement surfaced.
- Different **modes** (roundtable, debate, orchestrator) change how the members work together — start
  with the default.

---

## Step 5 — Start a memory layer

Models forget everything between sessions unless you give them somewhere to write things down. A
**memory layer** is just durable notes — decisions, facts, and context saved as files in your folder
that your models read next time.

- Begin simply: a `decisions` note, a `context` note. Plain text you can read and edit yourself.
- Treating memory as a first-class part of your system (not an afterthought) is what lets it **improve
  over time** instead of resetting every day. This is the single highest-leverage habit for a newcomer.

---

## Step 6 — Grow a team: the agent registry

As your system matures you'll want more than one agent — maybe a researcher, a writer, and a reviewer.
An **agent registry** is a simple list that records who each agent is, what it's allowed to do, and who
it answers to. It keeps a growing team organized and each role explicit.

- Start with **one** agent and a one-line description. Add the structure as you add agents — don't
  build an org chart before you have people in it.

---

## Step 7 — Grant capabilities deliberately

So far your models talk. When you want them to *act* — run a command, read and write files, use an
external service — you grant **capabilities**. Nexus ships these **off** and turns them on through
explicit, reviewed steps, with a **sandbox** and a **per-command approval** so nothing runs without
your say-so.

- Enable capabilities only when you have a concrete need, and start with the narrowest useful grant.
- Screen control ("computer use") is the most powerful and the most gated — leave it for last, if ever.

---

## Where to go from here

- Re-read the [agentic-systems glossary](agentic-glossary.md) once you've done Steps 1–5 — the concepts
  land differently after you've felt them.
- Keep your memory notes current. A system with good memory compounds.
- Revisit this roadmap from **Help** anytime. You can't break anything by exploring; the powerful
  actions are all gated.

**The one habit that matters most:** direct clearly, and write down what you decide. Good direction and
good memory beat a bigger model.
