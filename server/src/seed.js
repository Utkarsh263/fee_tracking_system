import bcrypt from 'bcryptjs';
import * as M from './models.js';
import { riskScore, instalmentStatus } from './rules.js';
const d = (s) => new Date(s + 'T00:00:00Z');
const PLANS = [ // [sid,name,centre,batch,totalFee,join,[due,amount,paid]...,attendance,scores,parentPhone]
  ['STU-0412', 'Aarav Meena', 'Jaipur-Malviya Nagar', 'JEE 2027 Morning', 120000, '2026-07-01', [['2026-07-10', 30000, 30000], ['2026-10-10', 30000, 30000], ['2027-01-10', 30000, 0], ['2027-04-10', 30000, 0]], [92, 90, 91], [78, 80, 82, 85], '9000000001'],
  ['STU-0587', 'Ishita Sharma', 'Jaipur-Vaishali', 'JEE 2027 Evening', 120000, '2026-07-01', [['2026-07-10', 30000, 30000], ['2026-10-10', 30000, 15000], ['2027-01-10', 30000, 0], ['2027-04-10', 30000, 0]], [88, 74, 58], [72, 70, 55, 48], '9000000002'],
  ['STU-0219', 'Mohit Gurjar', 'Jaipur-Malviya Nagar', 'NEET 2027 Morning', 120000, '2026-07-05', [['2026-07-15', 40000, 40000], ['2026-11-15', 40000, 0], ['2027-03-15', 40000, 0]], [85, 83, 84], [60, 62, 65, 66], '9000000003'],
];
const CENTRES = ['Jaipur-Malviya Nagar', 'Jaipur-Vaishali', 'Jaipur-Mansarovar', 'Jaipur-Tonk Road'];
const BATCHES = ['JEE 2027 Morning', 'JEE 2027 Evening', 'NEET 2027 Morning', 'NEET 2027 Evening'];
for (let k = 0; k < 13; k++) { // filler students so the dashboard has depth
  const paid2 = [30000, 0, 15000, 30000][k % 4], late = [0, 1, 1, 0][k % 4];
  PLANS.push([`STU-1${100 + k}`, ['Riya Jain', 'Karan Singh', 'Neha Gupta', 'Dev Rathore', 'Pooja Yadav', 'Rohit Saini', 'Anita Verma', 'Yash Joshi', 'Sana Khan', 'Vikram Shekhawat', 'Meera Agarwal', 'Tarun Bhati', 'Kavya Soni'][k],
    CENTRES[k % 4], BATCHES[(k + 1) % 4], 120000, '2026-07-01', [['2026-07-10', 30000, 30000], [late ? '2026-09-10' : '2026-10-10', 30000, paid2], ['2027-01-10', 30000, 0], ['2027-04-10', 30000, 0]],
    [90 - k * 2, 85 - k * 2, 80 - k * 3], [70, 68 - k, 65 - k * 2, 60 - k * 2], null]);
}
export async function seed() {
  await Promise.all(Object.values(M).map((m) => m.deleteMany({})));
  await M.User.create({ role: 'accounts', name: 'Accounts Executive', email: 'accounts@demo.test', hash: await bcrypt.hash('Demo@12345', 10) });
  let n = 0;
  for (const [sid, name, centre, batch, totalFee, join, ins, attendance, scores, phone] of PLANS) {
    const s = await M.Student.create({ sid, name, centre, batch, totalFee, joinDate: d(join), attendance, scores });
    if (phone) await M.User.create({ role: 'parent', name: `Parent of ${name}`, phone, lang: sid === 'STU-0587' ? 'en' : 'hi', students: [s._id] });
    for (const [i, [due, amount, paid]] of ins.entries()) {
      const inst = await M.Instalment.create({ student: s._id, no: i + 1, dueDate: d(due), amount, paid });
      if (paid) await M.Payment.create({ ref: `SEED-${sid}-${i}`, amount: paid, status: 'matched', student: s._id, instalment: inst._id, gst: Math.round((paid * 18) / 118), receiptNo: `RCT-${String(++n).padStart(5, '0')}`, linkId: 'seed' });
    }
  }
  await M.Payment.create({ ref: 'BANK-UTR-998877', amount: 12345, status: 'unmatched', note: 'UPI payment, no instalment reference' });
  await refreshRisk();
}
export async function refreshRisk(today = new Date()) {
  for (const s of await M.Student.find()) {
    const ins = await M.Instalment.find({ student: s._id });
    const overdueCount = ins.filter((i) => instalmentStatus(i, today).daysOverdue > 0).length;
    const r = riskScore({ overdueCount, attendance: s.attendance, scores: s.scores });
    s.risk = r; await s.save();
    // The flag ONLY creates a counsellor task. Never a fee action or parent message.
    if (r.flagged && !(await M.Task.exists({ student: s._id, status: 'open' }))) await M.Task.create({ student: s._id, score: r.score, reason: r.reasons.join(', ') });
  }
}
if (process.argv[1].endsWith('seed.js')) {
  const { default: mongoose } = await import('mongoose'); await import('dotenv/config');
  await mongoose.connect(process.env.MONGO_URI); await seed(); console.log('seeded'); process.exit(0);
}
