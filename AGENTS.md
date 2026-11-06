# AGENTS.md: rules for AI coding agents working on this repo

Three agents (Claude, Codex, Copilot) work on this project **in parallel, each in its own git worktree/branch**.
A human (the candidate) must be able to explain every line in a job interview, so prefer **simple, readable code that follows the existing patterns** over clever abstractions.

## Project

Employee Leave Management System (hackathon assignment). Read `README.md` first: features, business rules, workflow and API.

* Backend: Node 22 + Express 5, ESM, SQLite through the built-in `node:sqlite` (`DatabaseSync`, synchronous). Validation with `zod`.
* Frontend: React 19 + Vite + react-router-dom 7, plain CSS with design tokens in `client/src/styles.css` (no CSS framework).
* Tests: `node:test` + `supertest` in `server/tests/*.test.js` (in-memory DB, fixed clock: Friday 2026-11-06).

## Commands

```bash
npm install          # also installs client deps (postinstall)
npm test             # MUST pass before you finish
npm run build        # MUST pass before you finish (builds the React app)
PORT=3001 npm start  # run the app; use your own port (Claude 3000, Codex 3001, Copilot 3002)
npm run reset        # wipe DB + reseed (needed after schema changes; schema uses CREATE TABLE IF NOT EXISTS)
```

## Architecture rules (follow them)

1. **Layers:** `routes/` (thin HTTP) → `services/` (business rules) → `repositories/` (SQL only) → SQLite. No SQL in routes or services.
2. **Errors:** throw `AppError.validation|forbidden|notFound|conflict(...)` from `server/src/utils/errors.js` with a **friendly, user-facing message**. Field errors go in `fields: { fieldName: 'message' }`; the UI shows them inline.
3. **Validation:** zod schemas in the service, plus the same checks in the UI for instant feedback. The server is the source of truth.
4. **Business constants** go in `server/src/services/policy.js` (served to the UI by `GET /api/policy`). Don't hard-code numbers in the UI.
5. **Writes that change workflow state** run inside `transaction(db, fn)` and write an audit row (`audit.log({...})`).
6. **Security:** check permissions in the service (users who may not see an object get 404). Parameterised SQL only. Never log or return secrets.
7. **node:sqlite gotchas:** you can't bind `undefined` or booleans (use `null` / `0|1`); unknown named params throw.
8. **UI:** reuse components from `client/src/components/ui.jsx` (`PageHeader`, `Field`, `StatusBadge`, `EmptyState`, `Spinner`, `Modal`, `StatCard`…), the `useApi` hook and `useToast` from `context.jsx`, and existing CSS classes (`card`, `btn btn-primary`, `badge badge-*`, `chips`…). It must work on a 390 px wide phone and in dark mode (use the CSS variables).
9. Frontend API calls: create your own module in `client/src/api/<feature>.js` that imports `{ request }` from `../api.js`. Don't edit the shared `Api` object.

## File ownership (avoid merge conflicts)

| Owner | Feature | Files you own (create/edit freely) |
|-------|---------|------------------------------------|
| **Claude** | Sign-up + email verification (Resend), password toggle, HOD Team page, AI assistant | `services/AuthService.js`, `repositories/UserRepository.js`, `routes/authRoutes.js`, `routes/userRoutes.js`, `services/email*.js`, `pages/Login.jsx`, `pages/Register.jsx`, `pages/Team.jsx`, schema section `[auth]` |
| **Codex** | Leave balances, public holidays, half-day leave | `services/LeaveService.js`, `services/policy.js`, `utils/dates.js`, `repositories/LeaveRepository.js`, new `repositories/Holiday*.js`, `routes/holidayRoutes.js`, `db/seedLeavePolicy.js`, `components/LeaveForm.jsx`, `components/LeaveTable.jsx`, `pages/Dashboard.jsx`, `pages/Holidays.jsx`, `pages/LeaveDetail.jsx`, `client/src/utils.js`, `server/tests/workflow.test.js`, `server/tests/dates.test.js`, `routes/leaveRoutes.js`, `db/seed.js`, the `leave_requests` table definition in `schema.sql`, schema section `[balances & holidays & half-day]` |
| **Copilot** | In-app notifications | `services/NotificationService.js`, new `repositories/NotificationRepository.js`, `routes/notificationRoutes.js`, `components/NotificationBell.jsx`, `client/src/api/notifications.js`, new `server/tests/notifications.test.js`, schema section `[notifications]` |

* Routes, nav links and placeholder files for every feature are **already wired** (`app.js`, `App.jsx`, `Layout.jsx`). You should not need to edit them.
* Need a change in a file you don't own? Keep it **minimal** and list it in your final summary under "Touched shared files".
* Styles: append your CSS at the **end** of `client/src/styles.css` under a comment `/* ===== <feature> (<owner>) ===== */`.
* New DB tables go in **your** section of `server/src/db/schema.sql` (sections are marked). Use `CREATE TABLE IF NOT EXISTS`.
* Don't edit `README.md`. Write your feature notes in `docs/<feature>.md`; Claude merges them into the README.
* Commit on **your branch** with clear messages. **Don't push and don't merge.** Claude merges all branches.

## Definition of done

* `npm test` and `npm run build` pass. Add tests for the new rules in your own test file.
* Friendly error messages for every validation failure; color-coded UI consistent with the existing status colors.
* Feature works end to end in the browser for the demo accounts (password `Password@123`: `employee@example.com`, `manager@example.com`, `hod@example.com`).
* Final summary: what you built, files changed, shared files touched, how to test it.
