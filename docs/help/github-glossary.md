---
type: reference
status: active
last_touched: 2026-07-11
classification: business
project: nexus-product
---

# Git & GitHub glossary — for people who've never used version control

Nexus works best on a **repository** — a folder whose history is tracked. That tracking is what makes it
safe to let AI agents make changes: everything is recorded, reviewable, and reversible. This glossary
explains the terms with **no prior experience assumed**. You can start with a plain folder and adopt
these as you go.

## The big idea

**Version control** — A system that records the history of changes to a set of files, so you can see
what changed, when, and by whom — and undo anything. It's a time machine for your work.

**Git** — The most common version-control tool. It runs on your computer and tracks a folder's history.
"Using Git" means saving snapshots of your work over time instead of one ever-overwritten copy.

**GitHub** — A website that hosts Git repositories online. It adds a backup, a place to collaborate, and
tools for reviewing changes. Git is the tool; GitHub is a popular home for it. (Alternatives exist —
GitLab, Bitbucket — the concepts are the same.)

**Why it matters for agents** — When an agent changes a file, version control means you can see exactly
what it did, keep it or throw it away, and never lose your previous version. Guardrails plus a tracked
history is what makes autonomous work trustworthy.

## The core objects

**Repository (repo)** — A folder that Git is tracking, including its full history. Your project lives in
a repo. A repo can be **local** (on your computer) and/or **remote** (hosted on GitHub).

**Commit** — A saved snapshot of your files at a moment in time, with a short message describing the
change. History is a series of commits. Think "save point with a note."

**Commit message** — The short description attached to a commit ("Add pricing table", "Fix typo in
intro"). Good messages make history readable.

**Diff** — The exact lines added and removed between two versions. Reviewing a diff is how you see what
actually changed before accepting it.

**Branch** — A parallel line of work. You make a branch to try changes without touching your main copy;
if it works out you merge it back, if not you discard it. Agent work often happens on a branch so your
main version stays safe.

**Main (or master)** — The default, primary branch — usually your "known-good" version. A common safe
pattern: never change `main` directly; make changes on a branch and review before merging.

**Merge** — Combining the changes from one branch into another (e.g. bringing a finished branch into
`main`).

**Merge conflict** — When two changes touch the same lines and Git can't auto-combine them; you pick
what to keep. Normal, not scary — just a decision Git asks you to make.

## Working with a remote (GitHub)

**Remote** — A hosted copy of your repo (e.g. on GitHub) that your local repo syncs with.

**Clone** — Making a local copy of a remote repo on your computer.

**Push** — Sending your local commits up to the remote (backing them up / sharing them).

**Pull** — Bringing new commits from the remote down to your local copy.

**Fetch** — Checking what's new on the remote without changing your files yet.

**Pull request (PR)** — A proposal on GitHub to merge one branch into another, with the diff laid out
for review and discussion before it's accepted. This is the "one door" pattern: changes get reviewed
before they become official. A great habit for agent-made changes.

**Fork** — Your own copy of someone else's repo on GitHub, so you can experiment or propose changes
without affecting the original.

## A few more you'll meet

**.gitignore** — A file listing things Git should *not* track (secrets, caches, huge binaries). Keeps
private and junk files out of your history.

**Staging (git add)** — Choosing which changes go into your next commit. You stage, then commit.

**Tag / release** — A named marker for a specific version (e.g. `v1.0`), often used to mark a shipped
release.

**Repository visibility** — **Public** (anyone can see it) or **private** (only you and people you
invite). Keep anything sensitive private.

---

## The minimum you actually need to start

1. Put your project in a **folder**.
2. Make it a **repo** (turn on Git) so your history is tracked.
3. **Commit** as you reach save-worthy points, with short messages.
4. When you're comfortable, put it on **GitHub** for backup, and use **branches** + **pull requests**
   so changes — especially agent-made ones — get reviewed before they land.

You don't need the rest on day one. Add it as your project grows. The payoff is simple: **nothing you
do — or an agent does — is ever unrecoverable.**
