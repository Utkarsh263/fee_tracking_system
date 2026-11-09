import express from 'express'; import helmet from 'helmet'; import cors from 'cors'; import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken'; import bcrypt from 'bcryptjs'; import crypto from 'crypto'; import { z } from 'zod'; import path from 'path'; import { fileURLToPath } from 'url'; import fs from 'fs';
import { User, Student, Instalment, Payment, Reminder, Task, RefundRec, AuditLog } from './models.js';
import { instalmentStatus, ageBucket, calcRefund, reminderOffset, reminderText } from './rules.js';
import { refreshRisk } from './seed.js';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) throw new Error('JWT_SECRET required');
if (process.env.NODE_ENV === 'production' && !process.env.GATEWAY_WEBHOOK_SECRET) throw new Error('GATEWAY_WEBHOOK_SECRET required');
const SECRET = process.env.JWT_SECRET || 'dev-only-secret', HOOK = process.env.GATEWAY_WEBHOOK_SECRET || 'dev-hook-secret';
const DEMO = process.env.DEMO_MODE === 'true', URL_ = process.env.PUBLIC_URL || 'http://localhost:5000';
const h = (fn) => (req, res, next) => fn(req, res).catch(next);
const parse = (schema, data) => schema.parse(data);
const auth = (role) => (req, res, next) => { try { req.user = jwt.verify((req.headers.authorization || '').slice(7), SECRET); if (role && req.user.role !== role) return res.sendStatus(403); next(); } catch { res.sendStatus(401); } };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const sign = (u) => jwt.sign({ id: u._id, role: u.role, name: u.name }, SECRET, { expiresIn: '12h' });
const asOf = (v) => (v ? new Date(v + 'T00:00:00Z') : new Date());
const dstr = (x) => new Date(x).toISOString().slice(0, 10);
const audit = async (req, action, entityType, entityId, details = {}) => AuditLog.create({ actorId: String(req.user?.id || 'system'), actorName: req.user?.name || 'System', action, entityType, entityId: String(entityId || ''), details, ip: req.ip });
const xmlEsc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\"', '&quot;').replaceAll("'", '&apos;');

// Idempotent payment matching. Anything that can't be matched safely goes to the accounts queue.
export async function settle({ linkId, amount, ref }) {
  // Never create zero/negative-value queue records. A payment reference is unique.
  if (!Number.isFinite(amount) || amount <= 0 || !ref || typeof ref !== 'string') return { matched: false, rejected: true, reason: 'Invalid payment amount or reference' };
  if (await Payment.exists({ ref })) return { duplicate: true };
  const ins = linkId && (await Instalment.findOne({ linkId }));
  if (ins && ins.paid < ins.amount) {
    const ok = await Instalment.findOneAndUpdate({ _id: ins._id, $expr: { $lte: [{ $add: ['$paid', amount] }, '$amount'] } }, { $inc: { paid: amount } }, { new: true });
    if (ok) {
      const count = await Payment.countDocuments();
      await Payment.create({ ref, amount, status: 'matched', linkId, student: ins.student, instalment: ins._id, gst: Math.round((amount * 18) / 118), receiptNo: `RCT-${String(count + 1).padStart(5, '0')}` });
      return { matched: true };
    }
  }
  // Only positive real payment amounts enter the manual reconciliation queue.
  await Payment.create({ ref, amount, linkId, status: 'unmatched', note: ins ? 'Amount exceeds balance or instalment is already paid' : 'Unknown payment link' });
  return { matched: false };
}

export async function runReminders(today = new Date()) {
  let sent = 0;
  for (const i of await Instalment.find().populate('student')) {
    const offset = reminderOffset(i, today); if (offset === null) continue; // paid or not a reminder day
    const parent = await User.findOne({ students: i.student._id }); i.linkId ||= crypto.randomBytes(12).toString('hex'); await i.save();
    const lang = parent?.lang || 'hi';
    try { await Reminder.create({ instalment: i._id, student: i.student._id, offset, lang, text: reminderText(lang, { name: i.student.name, amount: i.amount - i.paid, due: dstr(i.dueDate), offset, url: `${URL_}/pay/${i.linkId}` }) }); sent++; } catch (e) { if (e.code !== 11000) throw e; }
  }
  await refreshRisk(today); return sent;
}

export function buildApp() {
  const app = express();
  app.use(helmet({ contentSecurityPolicy: false })); app.use(cors({ origin: process.env.CORS_ORIGIN || true })); app.use(express.json({ limit: '100kb' }));
  const lim = rateLimit({ windowMs: 15 * 60e3, limit: 30 });
  const api = express.Router(); app.use('/api', api);

  // ---- auth
  api.post('/auth/otp', lim, h(async (req, res) => {
    const { phone } = parse(z.object({ phone: z.string().regex(/^[6-9]\d{9}$/) }), req.body);
    const u = await User.findOne({ phone, role: 'parent' }); const otp = String(crypto.randomInt(100000, 999999));
    if (u) { u.otpHash = sha(otp); u.otpExp = new Date(Date.now() + 5 * 60e3); await u.save(); console.log(`[mock-sms] OTP for ${phone}: ${DEMO ? otp : '******'}`); }
    res.json({ sent: true, devOtp: DEMO && u ? otp : undefined }); // same response for unknown numbers: no enumeration
  }));
  api.post('/auth/verify', lim, h(async (req, res) => {
    const b = parse(z.object({ phone: z.string(), otp: z.string().length(6), consent: z.boolean().optional() }), req.body);
    const u = await User.findOne({ phone: b.phone, role: 'parent' });
    if (!u || !u.otpHash || u.otpExp < new Date() || u.otpHash !== sha(b.otp)) return res.status(401).json({ error: 'Invalid or expired OTP' });
    if (!u.consentAt) { if (!b.consent) return res.status(409).json({ error: 'Parental consent required', needConsent: true }); u.consentAt = new Date(); } // DPDP
    u.otpHash = undefined; await u.save(); res.json({ token: sign(u) });
  }));
  api.post('/auth/login', lim, h(async (req, res) => {
    const b = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
    const u = await User.findOne({ email: b.email, role: 'accounts' });
    if (!u || !(await bcrypt.compare(b.password, u.hash))) return res.status(401).json({ error: 'Wrong email or password' });
    res.json({ token: sign(u) });
  }));

  // ---- parent
  api.get('/me', auth('parent'), h(async (req, res) => {
    const u = await User.findById(req.user.id);
    const students = await Promise.all((await Student.find({ _id: { $in: u.students } })).map(async (s) => {
      const ins = (await Instalment.find({ student: s._id }).sort('no')).map((i) => ({ id: i._id, no: i.no, dueDate: dstr(i.dueDate), amount: i.amount, paid: i.paid, ...instalmentStatus(i) }));
      const receipts = await Payment.find({ student: s._id, status: 'matched' }).sort('-createdAt').select('amount gst receiptNo createdAt');
      return { id: s._id, name: s.name, batch: s.batch, centre: s.centre, instalments: ins, next: ins.find((i) => i.balance > 0) || null, receipts, attendance: s.attendance, scores: s.scores };
    }));
    res.json({ name: u.name, lang: u.lang, students });
  }));
  api.post('/pay/:id', auth('parent'), h(async (req, res) => { // link only for the parent's own child
    const u = await User.findById(req.user.id); const ins = await Instalment.findById(req.params.id);
    if (!ins || !u.students.some((s) => s.equals(ins.student))) return res.sendStatus(404);
    if (ins.paid >= ins.amount) return res.status(400).json({ error: 'Already paid' });
    ins.linkId ||= crypto.randomBytes(12).toString('hex'); await ins.save(); res.json({ linkId: ins.linkId });
  }));
  // ---- mock gateway (stands in for Razorpay/Cashfree test mode)
  api.get('/checkout/:linkId', h(async (req, res) => {
    const ins = await Instalment.findOne({ linkId: req.params.linkId }).populate('student');
    if (!ins) return res.sendStatus(404); const balance = Math.max(0, ins.amount - ins.paid); if (balance <= 0) return res.status(410).json({ error: 'This instalment is already paid' }); res.json({ student: ins.student.name, no: ins.no, balance, due: dstr(ins.dueDate) });
  }));
  api.post('/checkout/:linkId', h(async (req, res) => {
    const { outcome } = parse(z.object({ outcome: z.enum(['success', 'fail']) }), req.body);
    const ins = await Instalment.findOne({ linkId: req.params.linkId }); if (!ins) return res.sendStatus(404);
    if (outcome === 'fail') return res.json({ ok: false });
    const balance = ins.amount - ins.paid; if (balance <= 0) return res.status(410).json({ error: 'This instalment is already paid' });
    const body = { linkId: req.params.linkId, amount: balance, ref: 'MOCK-' + crypto.randomBytes(6).toString('hex') };
    const result = await settle(body); if (result.rejected || !result.matched) return res.status(409).json({ error: 'Payment could not be matched safely', ...result });
    res.json({ ok: true, ...result }); // in real life the gateway calls the signed webhook below
  }));
  api.post('/webhooks/gateway', h(async (req, res) => {
    const sig = crypto.createHmac('sha256', HOOK).update(JSON.stringify(req.body)).digest('hex');
    if (req.headers['x-signature'] !== sig) return res.sendStatus(401);
    const b = parse(z.object({ linkId: z.string().optional(), amount: z.number().positive(), ref: z.string() }), req.body); res.json(await settle(b));
  }));

  // ---- accounts
  const acc = auth('accounts');
  api.get('/accounts/summary', acc, h(async (req, res) => {
    const today = asOf(req.query.asOf), rows = new Map();
    for (const i of await Instalment.find().populate('student', 'centre batch')) {
      const k = i.student.centre + '|' + i.student.batch;
      const r = rows.get(k) || { centre: i.student.centre, batch: i.student.batch, billed: 0, collected: 0, outstanding: 0, current: 0, d1_30: 0, d31_60: 0, d60p: 0 };
      const st = instalmentStatus(i, today); r.billed += i.amount; r.collected += i.paid; r.outstanding += st.balance; r[ageBucket(st.daysOverdue)] += st.daysOverdue > 0 ? st.balance : 0; rows.set(k, r);
    }
    const list = [...rows.values()].sort((a, b) => a.centre.localeCompare(b.centre) || a.batch.localeCompare(b.batch));
    const total = list.reduce((t, r) => { for (const k of Object.keys(r)) if (typeof r[k] === 'number') t[k] = (t[k] || 0) + r[k]; return t; }, {});
    res.json({ rows: list, total, unmatched: await Payment.countDocuments({ status: 'unmatched' }), openTasks: await Task.countDocuments({ status: 'open' }) });
  }));
  api.get('/accounts/students', acc, h(async (req, res) => {
    const q = String(req.query.q || '').slice(0, 40), today = asOf(req.query.asOf);
    const f = q ? { $or: [{ name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { sid: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }] } : {};
    const out = []; for (const s of await Student.find(f).sort('sid').limit(100)) {
      const ins = (await Instalment.find({ student: s._id }).sort('no')).map((i) => ({ id: i._id, no: i.no, dueDate: dstr(i.dueDate), amount: i.amount, paid: i.paid, ...instalmentStatus(i, today) }));
      out.push({ id: s._id, sid: s.sid, name: s.name, centre: s.centre, batch: s.batch, totalFee: s.totalFee, joinDate: dstr(s.joinDate), risk: s.risk, instalments: ins,
        balance: ins.reduce((t, i) => t + i.balance, 0), maxOverdue: Math.max(0, ...ins.map((i) => i.daysOverdue)) });
    } res.json(out);
  }));
  api.post('/accounts/refund/preview', acc, h(async (req, res) => res.json(await refund(req.body))));
  api.post('/accounts/refund', acc, h(async (req, res) => {
    const r = await refund(req.body); const rec = await RefundRec.create({ student: req.body.studentId, leaveDate: req.body.leaveDate, paid: r.paid, consumed: r.consumed, admin: r.admin, refund: r.refund, payBy: r.payBy, by: req.user.name }); await audit(req, 'refund.recorded', 'refund', rec._id, { studentId: req.body.studentId, refund: r.refund, leaveDate: req.body.leaveDate }); res.json({ saved: true, id: rec._id, ...r });
  }));
  async function refund(body) {
    const b = parse(z.object({ studentId: z.string(), leaveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), body);
    const s = await Student.findById(b.studentId); if (!s) throw Object.assign(new Error('Student not found'), { status: 404 });
    const paid = (await Instalment.find({ student: s._id })).reduce((t, i) => t + i.paid, 0);
    return { paid, ...calcRefund({ totalFee: s.totalFee, paid, joinDate: s.joinDate, leaveDate: b.leaveDate }) };
  }
  api.get('/accounts/queue', acc, h(async (req, res) => res.json(await Payment.find({ status: 'unmatched' }).sort('-createdAt'))));
  api.post('/accounts/queue/:id/match', acc, h(async (req, res) => {
    const { instalmentId } = parse(z.object({ instalmentId: z.string() }), req.body); const p = await Payment.findOne({ _id: req.params.id, status: 'unmatched' }); const ins = await Instalment.findById(instalmentId);
    if (!p || !ins) return res.sendStatus(404); if (!Number.isFinite(p.amount) || p.amount <= 0) return res.status(400).json({ error: 'Payment amount must be positive' });
    const ok = await Instalment.findOneAndUpdate({ _id: ins._id, $expr: { $lte: [{ $add: ['$paid', p.amount] }, '$amount'] } }, { $inc: { paid: p.amount } });
    if (!ok) return res.status(400).json({ error: 'Amount is more than the instalment balance' });
    Object.assign(p, { status: 'matched', instalment: ins._id, student: ins.student, gst: Math.round((p.amount * 18) / 118), receiptNo: `RCT-${String((await Payment.countDocuments()) + 1).padStart(5, '0')}` }); await p.save(); await audit(req, 'payment.matched', 'payment', p._id, { instalmentId: ins._id, amount: p.amount, ref: p.ref }); res.json({ ok: true });
  }));
  api.get('/accounts/tasks', acc, h(async (req, res) => res.json(await Task.find({ status: 'open' }).populate('student', 'sid name batch centre').sort('-score'))));
  api.patch('/accounts/tasks/:id', acc, h(async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(['done', 'false_flag']) }), req.body); const task = await Task.findByIdAndUpdate(req.params.id, { status }, { new: true }); if (!task) return res.sendStatus(404); await audit(req, `task.${status}`, 'task', task._id, { score: task.score }); res.json({ ok: true });
  }));
  api.post('/accounts/reminders/run', acc, h(async (req, res) => { const sent = await runReminders(asOf(req.body?.asOf)); await audit(req, 'reminders.run', 'reminder', '', { sent, asOf: req.body?.asOf || null }); res.json({ sent }); }));
  api.get('/accounts/reminders', acc, h(async (req, res) => res.json(await Reminder.find().populate('student', 'name sid').sort('-createdAt').limit(50))));
  api.get('/accounts/reconciliation', acc, h(async (req, res) => {
    const [matched, unmatched, matchedAmount, unmatchedAmount] = await Promise.all([
      Payment.countDocuments({ status: 'matched' }), Payment.countDocuments({ status: 'unmatched' }),
      Payment.aggregate([{ $match: { status: 'matched' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Payment.aggregate([{ $match: { status: 'unmatched' } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
    ]);
    res.json({ matched, unmatched, matchedAmount: matchedAmount[0]?.total || 0, unmatchedAmount: unmatchedAmount[0]?.total || 0 });
  }));
  api.get('/accounts/audit', acc, h(async (req, res) => res.json(await AuditLog.find().sort('-createdAt').limit(100))));
  api.get('/accounts/tally.xml', acc, h(async (req, res) => {
    const rows = await Payment.find({ status: 'matched' }).populate('student', 'sid name centre').sort('createdAt');
    const vouchers = rows.map((p) => `<TALLYMESSAGE><VOUCHER VCHTYPE=\"Receipt\" ACTION=\"Create\"><DATE>${dstr(p.createdAt).replaceAll('-', '')}</DATE><VOUCHERNUMBER>${xmlEsc(p.receiptNo)}</VOUCHERNUMBER><PARTYLEDGERNAME>${xmlEsc(p.student?.name || 'Student')}</PARTYLEDGERNAME><NARRATION>${xmlEsc(`${p.student?.sid || ''} ${p.student?.name || ''}`)}</NARRATION><ALLLEDGERENTRIES.LIST><LEDGERNAME>Gateway Clearing</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${Number(p.amount).toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>${xmlEsc(`Fees - ${p.student?.centre || 'Centre'}`)}</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-${Number(p.amount).toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST></VOUCHER></TALLYMESSAGE>`).join('');
    const xml = `<?xml version=\"1.0\" encoding=\"UTF-8\"?><ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC><REQUESTDATA>${vouchers}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
    res.type('application/xml').attachment('tally-vouchers.xml').send(xml);
  }));
  api.get('/accounts/tally.csv', acc, h(async (req, res) => {
    const rows = await Payment.find({ status: 'matched' }).populate('student', 'sid name centre').sort('createdAt');
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['Date,Voucher Type,Voucher No,Debit Ledger,Credit Ledger,Amount,GST Included,Narration', ...rows.map((p) => [dstr(p.createdAt), 'Receipt', p.receiptNo, 'Gateway Clearing', `Fees - ${p.student?.centre}`, p.amount, p.gst, `${p.student?.sid} ${p.student?.name}`].map(esc).join(','))].join('\n');
    res.type('text/csv').send(csv);
  }));

  const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get(/^(?!\/api).*/, (q, r) => r.sendFile(path.join(dist, 'index.html'))); }
  app.use((err, req, res, next) => { // eslint-disable-line
    if (err.name === 'ZodError') return res.status(400).json({ error: 'Invalid input' });
    if (err.status) return res.status(err.status).json({ error: err.message }); console.error(err); res.status(500).json({ error: 'Something went wrong' });
  });
  return app;
}
