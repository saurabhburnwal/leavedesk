# How AI tools were used

I built this project with four AI coding agents working **in parallel**, the way a small team would split work. I acted as the tech lead: I set scope and priorities, made the product decisions, and reviewed every change before it was merged.

## Who did what

| Agent | Role | Delivered |
|-------|------|-----------|
| **Claude Code** | Lead / integrator | Requirements breakdown, architecture, core leave workflow (state machine, validation, RBAC), sign-up + email verification, HOD Team page, app shell + light/dark switcher, tamper-evident audit log, request IDs, calendar (.ics) export, CI, the Groq AI assistant, deployment (Render), reviewing/fixing/merging the other agents' work, browser QA, docs |
| **OpenAI Codex** | Backend-heavy features | Leave balances, public holidays, half-day leave, dashboard redesign |
| **GitHub Copilot CLI** | Self-contained features | In-app notifications, range-picker calendar on the Apply form |
| **Google Antigravity** | Visual design | Login/Register redesign and the dashboard illustration (its stylesheet was later rewritten by Claude to fix layout bugs) |

## How parallel work was coordinated

* **`AGENTS.md`** is a shared rulebook: architecture rules (routes → services → repositories), error-message conventions, and a **file-ownership table**, so two agents never edited the same file.
* **Seams prepared up front:** before handing out tasks, the lead agent added placeholder files and hooks (for example the `notifier.notify(...)` hook inside `LeaveService` transactions, pre-mounted routes, empty pages and per-feature CSS files). Each agent filled in only its own files.
* **Git as the safety net:** a baseline commit, a branch/worktree per agent for the first round, a fallback tag (`v1-submit-ready`) before the UI redesign, and commits that contain only the files a given agent owns.
* **Review gate:** nothing was committed until `npm test` and `npm run build` passed and the feature had been clicked through in a real browser (Playwright) at desktop and phone widths, in light and dark mode. Merge conflicts (`app.js`, `styles.css`) were resolved by hand, and small UI defects found in review (cut-off date fields, hover state on the selected day, mobile top bar) were fixed before committing.

### What went wrong, and what I learned

* **Codex's sandbox** could only write to `/tmp`, not to its git worktree. It kept working in a copy, and its changes were imported by comparing the two folders, then merged through git.
* **Copilot started in the main folder** instead of its worktree. Its unfinished files were swept into one commit, so that commit was split back out.
* **A CSS rewrite by one agent briefly deleted another agent's styles.** Review caught it, and the styles were restored from git.
* **Lessons:** start each agent inside its own directory, give it an explicit file list, never use `git add -A` while agents are active, and review visually, not only with tests.

## Decisions I made (not the AI)

* Stack: React + Express + **SQLite** for a zero-setup demo, rather than remote Supabase (avoids shipping credentials and the risk of a paused free-tier database).
* "More than 3 consecutive leaves" counts **working days**: weekends and public holidays are excluded.
* Sign-up: anyone can register, but only as an **Employee**, and must verify their email; the **HOD promotes** people to Manager.
* Email through **Resend**, with a "demo mode" that shows the code on screen, so assessors don't need an API key.
* Scope cuts under time pressure: the LLM assistant was postponed rather than shipped half-working.

## Responsible AI

* **No AI in the decision path.** Leave approvals are always made by people. The app needs no API keys; the optional AI assistant switches itself off without one.
* **No real personal data** was shared with AI tools; all demo data is synthetic (`example.com`).
* **No secrets in the repo.** `.env` is git-ignored and the JWT secret is generated on first run.
* **AI inside the product (Groq) follows the same rules.** The three features are the plain-English leave request, the RAG policy assistant and the approver insight, and none of them makes decisions:
  * AI output is labelled.
  * It is validated with zod and re-checked by the normal leave rules.
  * Every AI call is audit-logged (metadata only) and rate-limited per user.
  * The facts an approver sees are computed in code; the model only phrases them.
  * The app works fully without a key.
* **Found in testing:** the first policy prompt let the model subtract used days twice ("2 sick days left" instead of 6). I fixed it by labelling the balance data unambiguously, and this is why the answers cite their sources.

## Example delegation prompt

> *"Build in-app notifications. Implement `NotificationService.notify(event, { leave, previous, actor, comment })`, which `LeaveService` already calls inside its DB transaction. Recipients: SUBMITTED → current approver; APPROVED and still pending → employee + HOD; REJECTED → employee (include the comment)… Never notify the actor themself. Users may only read their own notifications (404 otherwise). Add tests. Edit only the files listed in AGENTS.md."*

Every prompt had the same shape: the context file to read, the exact files the agent owns, business rules, edge cases, required tests, and a definition of done.
