// Pure business rules: no DB, fully unit-tested. All policy numbers are ASSUMPTIONS (see TDD).
export const DAY = 864e5;
export const daysBetween = (a, b) => Math.floor((Date.UTC(...ymd(b)) - Date.UTC(...ymd(a))) / DAY);
const ymd = (d) => { const x = new Date(d); return [x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()]; };
export const addDays = (d, n) => new Date(new Date(d).getTime() + n * DAY);

export function instalmentStatus(i, today = new Date()) {
  const balance = i.amount - i.paid;
  if (balance <= 0) return { status: 'paid', balance: 0, daysOverdue: 0 };
  const d = daysBetween(i.dueDate, today);
  if (d > 0) return { status: i.paid > 0 ? 'part_overdue' : 'overdue', balance, daysOverdue: d };
  return { status: i.paid > 0 ? 'part_due' : 'due', balance, daysOverdue: 0, daysToDue: -d };
}
export const ageBucket = (d) => (d <= 0 ? 'current' : d <= 30 ? 'd1_30' : d <= 60 ? 'd31_60' : 'd60p');

export const POLICY = { termDays: 365, adminFeePct: 5, adminFeeCap: 5000, payoutDays: 10, gstPct: 18 };
export function calcRefund({ totalFee, paid, joinDate, leaveDate }, p = POLICY) {
  const used = daysBetween(joinDate, leaveDate);
  if (used < 0) throw new Error('Leaving date is before joining date');
  const consumed = Math.round(totalFee * Math.min(1, used / p.termDays));
  const admin = Math.min(Math.round((totalFee * p.adminFeePct) / 100), p.adminFeeCap);
  const net = paid - consumed - admin;
  return { daysUsed: used, consumed, admin, refund: Math.max(0, net), stillOwed: Math.max(0, -net),
    payBy: addDays(leaveDate, p.payoutDays), gstOnRetained: Math.round(((consumed + admin) * p.gstPct) / (100 + p.gstPct)) };
}

export const OFFSETS = [-3, 0, 3, 7, 14]; // days relative to due date
export const reminderOffset = (inst, today) => {
  if (inst.amount - inst.paid <= 0) return null; // paid: reminders stop
  const d = daysBetween(inst.dueDate, today);
  return OFFSETS.includes(d) ? d : null;
};
export function reminderText(lang, { name, amount, due, offset, url }) {
  const when = { en: offset < 0 ? `due in ${-offset} days` : offset === 0 ? 'due today' : `${offset} days overdue`,
    hi: offset < 0 ? `${-offset} दिन में देय है` : offset === 0 ? 'आज देय है' : `${offset} दिन से बकाया है` }[lang === 'en' ? 'en' : 'hi'];
  return lang === 'en' ? `Hello, fee of ₹${amount} for ${name} is ${when} (${due}). Pay: ${url}`
    : `नमस्कार, ${name} की ₹${amount} फीस ${when} (${due})। भुगतान करें: ${url}`;
}

// Transparent heuristic, not a trained model. Output only creates a counsellor task.
export function riskScore({ overdueCount = 0, attendance = [], scores = [] }) {
  let score = 0; const reasons = [];
  if (overdueCount) { score += Math.min(60, overdueCount * 30); reasons.push(`${overdueCount} overdue instalment(s)`); }
  const a = attendance.at(-1);
  if (a != null && a < 60) { score += 35; reasons.push(`attendance ${a}%`); } else if (a != null && a < 75) { score += 20; reasons.push(`attendance ${a}%`); }
  if (attendance.length >= 3 && attendance.at(-3) - a >= 15) { score += 10; reasons.push('attendance falling'); }
  if (scores.length >= 4) {
    const rec = avg(scores.slice(-2)), old = avg(scores.slice(0, -2));
    if (old - rec >= 10) { score += 20; reasons.push('test scores falling'); }
  }
  return { score: Math.min(100, score), flagged: score >= 50, reasons };
}
const avg = (x) => x.reduce((s, v) => s + v, 0) / x.length;
