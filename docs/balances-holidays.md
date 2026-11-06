# Leave balances, public holidays, and half-day leave

## Leave balances

The annual allowances are served by `GET /api/policy`: 12 casual, 10 sick, 15 earned, and unlimited unpaid days. Balances are calculated from leave requests for the current calendar year. Approved requests count as used; pending and info-requested requests reserve days. Editing checks availability after releasing that request's own reservation. Approval moves reserved days into used days without changing the available total.

`GET /api/leaves/balances` returns the signed-in employee's balance. Dashboard cards show used, pending, and available days. Approvers see the employee's balance on the leave detail page.

## Public holidays

Holidays are stored in the `holidays` table and exposed through `GET /api/holidays`. HODs can add and delete holidays; both changes are written to the audit log. Working-day calculations exclude weekends and holidays. The browser fetches and caches the calendar for live form totals. Adding a holiday does not rewrite `working_days` already stored on existing leave requests.

## Half-day leave

A single date can be requested as a full day, first half, or second half. Half-day requests store `working_days = 0.5` and their `day_part`. The two different halves can be requested independently on one date. Full-day overlaps and all other overlaps remain blocked.

## Verification

Run `npm test`, `npm run build`, then `npm run reset`. Start the app with `PORT=3001 npm start` and sign in with `employee@example.com` or `hod@example.com` using `Password@123`.
