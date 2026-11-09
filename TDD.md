---
title: "FeeDesk: Technical Design Document"
subtitle: "Fee ledger, parent portal and refunds for Company A, Jaipur"
---

**GitHub:** https://github.com/<your-username>/fee-desk (replace with your actual public repository URL before submitting)
**Live app:** <add link if deployed>

# 1. Scope and assumptions
Core slice built end to end: fee ledger, parent portal with dues and pay link, reminders that stop on payment, refund calculator, dues dashboard. Roles: parent and accounts executive. AI: dropout-risk flag. Payments and SMS/WhatsApp delivery remain simulated; the app provides a printable receipt (browser Print → Save as PDF), CSV export, and a Tally XML voucher export template. No live gateway or messaging provider is configured.

Every number below that is not in the brief is an assumption:

| # | Assumption |
|---|---|
| A1 | Refund = fees paid, minus pro-rata fee for days attended (total fee × days / 365), minus an admin fee of 5% of total fee capped at ₹5,000. Never below zero. The client's real written policy replaces these constants in one place (`POLICY` in `rules.js`). |
| A2 | Refund payable within 10 days of the leaving date, per the brief's reading of the 2024 guidelines. |
| A3 | Academic term is 365 days from the joining date. |
| A4 | GST 18%, treated as included in the fee. GST on a receipt = amount × 18 / 118. |
| A5 | Reminders go at −3, 0, +3, +7 and +14 days relative to the due date, in the parent's language. |
| A6 | Risk score is heuristic: overdue instalments (30 each, max 60), attendance below 75% (+20) or 60% (+35), attendance falling 15 points (+10), test average falling 10 points (+20). Flag at 50 or more. |
| A7 | One parent account per student in seed data; a parent account can link several children. |
| A8 | Seed data: the 3 sample rows plus 13 invented students across 4 centres. Names and phones are fictional. |

# 2. Architecture and why
MERN: React (Vite) SPA, Express API, MongoDB (Mongoose). One deployable service: Express serves the built client and `/api`.

- **Why MongoDB:** an instalment plan is a small set of documents per student, read together; no cross-student transactions are needed. Payment matching uses a single atomic `findOneAndUpdate` with a balance guard instead of a transaction.
- **Why one service:** budget of ₹6 lakh and 6 weeks favours the simplest thing to run and hand over.
- **Business rules are pure functions** in `server/src/rules.js` (status, ageing, refund, reminder schedule, risk). They have no database dependency, so they are unit tested directly.
- **Scheduling:** `node-cron` runs reminders daily at 09:00 IST. A "Run now" button and a "view as of" date let a reviewer see the schedule without waiting.
- **Security:** JWT (12h), role checks per route, zod validation on every body, helmet, rate-limited auth routes, OTP stored only as a SHA-256 hash with 5-minute expiry, identical response for unknown phone numbers, parents can only create pay links for their own child, signed webhook (HMAC), no secrets in the repo (`.env.example` lists names only).

# 3. Data model
| Collection | Key fields |
|---|---|
| User | role (parent/accounts), phone or email, password hash (staff), language, linked students, consentAt |
| Student | sid, name, centre, batch, totalFee, joinDate, attendance[], scores[], risk{score, flagged, reasons} |
| Instalment | student, no, dueDate, amount, paid, linkId |
| Payment | unique ref, amount, status matched/unmatched, instalment, GST, receiptNo |
| Reminder | instalment, offset, language, text; unique (instalment, offset) |
| Task | student, reason, score, status open/done/false_flag |
| RefundRec | student, leaveDate, breakdown, payBy, recordedBy |
| AuditLog | actor, action, entity, details, IP, timestamp |

Status and days overdue are computed from `dueDate`, `amount` and `paid` at read time and never stored, so they cannot go stale.

# 4. Main flows
1. **Parent login:** phone, OTP, then a one-time parental consent tick (DPDP Act 2023) stored with a timestamp. Token returned.
2. **Pay:** the portal shows amount, due date and one button. The button creates a link for the instalment. The mock checkout "pays" the balance by calling the same `settle()` the signed webhook uses.
3. **Payment matching:** duplicate refs are ignored (webhook retries are safe). A matched payment atomically increments `paid` only if it will not exceed the amount. Anything else (unknown link, too much money) becomes an *unmatched* payment in the accounts queue and changes no balance. Accounts match it manually.
4. **Reminders:** for each unpaid instalment whose day offset is in the schedule, create one reminder in the parent's language (Hindi or English). The unique index makes reruns idempotent. Paid instalments never qualify, so reminders stop the moment payment lands.
5. **Refund:** pick a student and leaving date; the calculator shows paid, pro-rata use, admin fee, GST on retained amount, refund and the pay-by date. A refund can be recorded. If the family has paid less than they used, the screen shows the amount still owed instead of a negative refund.
6. **Dashboard and reconciliation:** outstanding by centre and batch with ageing buckets (current, 1–30, 31–60, 60+), matched/unmatched payment counts and amounts, plus CSV and XML voucher exports.
7. **Receipts and audit:** parents can print/save an individual receipt as PDF from the browser. Staff refund, queue matching, task status and reminder-run actions are recorded in an accounts-only audit log.

# 5. How the AI part works
A transparent, rule-based risk score (A6), not a trained model; with no historical dropout labels, a model would be unjustifiable. Inputs are missed instalments, attendance trend and test trend. When the score reaches 50 it **only creates a counsellor call task**. It never touches fees and never messages a parent. Counsellors close a task as "done" or mark it **false flag**. Each task shows the reasons, so staff can judge it. Next step: log false-flag rates and tune the weights, or train a model once labels exist.

**When automation is unsure or wrong:** unmatched payments go to a human queue; the flag is advisory; refund shows a clear error for impossible dates.

# 6. UI and design decisions
Restrained palette (white, one blue, red only for overdue), system fonts with Devanagari support, generous spacing, no decoration.

- **Parent home:** the five-second rule. The amount in large type, the due date, a single full-width Pay button. Receipts, attendance and scores sit below in tabs. Hindi is the default with a one-tap English toggle. Large tap targets suit low-end phones.
- **Mock checkout:** one amount and two buttons, with a clear failure state ("you were not charged").
- **Accounts:** five tabs (Dashboard, Ledger, Refund, Queue, Reminders). The dashboard leads with four numbers, then one table by centre and batch.
- Every list has loading, empty and error states with a retry button. Focus rings and labels support keyboard use.

# 7. Testing and honest limits
- 8 unit tests cover refund maths, negative refund, invalid dates, instalment status on the three sample rows, reminder schedule and stop-on-payment, Hindi/English text, risk flag and ageing.
- **Not verified in my build environment:** the API and UI were not run against a live database there (the sandbox could not download MongoDB). Run the demo path in deployment.md before submitting and fix anything you find.
- No automated API or UI tests yet; mock payments and messages; no refresh tokens; JWT stored in localStorage.
- Tally XML is an export template and must be validated against the reviewer's Tally company ledger names before importing. PDF receipts use the browser print dialog; choose Save as PDF.
- Payment checkout rejects stale/fully-paid links and the settlement layer rejects non-positive amounts. Positive overpayments/unknown-link payments are held for human reconciliation; do not treat them as collected fees.

# 8. What was cut and what next
Cut: bulk CSV upload of attendance and scores (API and screen), live SMS/WhatsApp and payment gateway credentials, multi-child switcher polish, refund approval workflow and full Tally chart-of-accounts mapping.
Next: bulk upload with row-level error report, refund approval step, automated API/browser integration tests, live gateway and messaging provider only if the client requires them, organisation GST details on receipts, validate Tally XML against the target company, and tune risk weights from counsellor feedback.
