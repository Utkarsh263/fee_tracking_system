# FeeDesk: deployment.md

## Run locally
1. Install Node 20+ (and optionally a MongoDB URI; MongoDB Atlas free tier works).
2. `npm run install:all`
3. Copy `.env.example` to `server/.env` and fill values. Leave `MONGO_URI` empty to use an in-memory MongoDB (the first run downloads a mongod binary of about 100 MB). For a stable setup, paste an Atlas URI.
4. `npm run dev`. The API starts on :5000 and seeds sample data when the database is empty.
5. In a second terminal: `cd client && npm run dev`, then open http://localhost:5173.
6. Tests: `npm test` (8 unit tests on refund, status, reminder, risk and ageing rules; no database needed).
7. Parent receipts: open Receipts and choose **Print / Save PDF**; in the browser print dialog select **Save as PDF**.
8. Accounts: Dashboard includes reconciliation totals and both CSV and XML export actions; Audit shows recent staff actions.

## Deploy (single service, e.g. Render)
- Build command: `npm run install:all && npm run build`
- Start command: `npm start` (Express serves `client/dist` and `/api`).
- Database: MongoDB Atlas free cluster.
- Environment variables (names only): `MONGO_URI`, `JWT_SECRET`, `GATEWAY_WEBHOOK_SECRET`, `DEMO_MODE`, `SEED_ON_BOOT`, `PUBLIC_URL`, `PORT`, `NODE_ENV`, `CORS_ORIGIN` (optional).
- For the reviewer demo set `DEMO_MODE=true` (shows the OTP on screen because SMS is mocked) and `SEED_ON_BOOT=true`. Turn `DEMO_MODE` off for anything real.
- Payment checkout is a clearly labelled simulation. No Razorpay/Cashfree account is required for the demo. Do not represent simulated payments as real transfers.
- Tally XML export is a voucher template; validate ledger names and import settings in a non-production Tally company before using it for accounting. CSV export remains available.

## Demo logins
| Role | Login | Notes |
|---|---|---|
| Parent (Aarav, paid) | 9000000001 | OTP appears on screen in demo mode; tick consent on first login |
| Parent (Ishita, part paid, English) | 9000000002 | Has the overdue instalment and a risk flag |
| Parent (Mohit, due soon) | 9000000003 | Hindi reminders |
| Accounts executive | accounts@demo.test / Demo@12345 | Dashboard, ledger, refund, queue, reminders |

## Suggested demo path
1. Log in as 9000000003. See ₹40,000 due on 2026-11-15. Tap Pay, then simulate success. The instalment is paid and a receipt with GST appears.
2. Log in as accounts. In Reminders pick the date 2026-11-12 and run. The Hindi and English messages appear, and a second run creates no duplicates. A paid instalment gets none.
3. Queue: match the ₹12,345 unmatched UPI payment to an instalment. Mark a counsellor task done or false flag.
4. Refund: choose a student and leaving date. Check the breakdown and the pay-by date.
5. Dashboard: ageing by centre and batch, then Export to Tally.
