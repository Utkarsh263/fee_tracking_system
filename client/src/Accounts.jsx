import { useState } from 'react'; import { api, useApi, inr, setTok, tok } from './api.js'; import { Gate, Empty, Err, Spinner } from './ui.jsx';
const TABS = ['Dashboard', 'Ledger', 'Refund', 'Queue', 'Reminders', 'Audit'];
export default function Accounts() {
  const [tab, setTab] = useState('Dashboard'); const [asOf, setAsOf] = useState('');
  return (<main className="wide"><header className="row between"><h1>FeeDesk</h1><button className="link" onClick={() => { setTok(null); location.href = '/'; }}>Log out</button></header>
    <nav className="tabs">{TABS.map((k) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{k}</button>)}</nav>
    <label className="inline muted">View as of <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /> <small>(demo: move the clock)</small></label>
    {tab === 'Dashboard' && <Dashboard asOf={asOf} />}{tab === 'Ledger' && <Ledger asOf={asOf} />}{tab === 'Refund' && <Refund />}{tab === 'Queue' && <Queue />}{tab === 'Reminders' && <Reminders asOf={asOf} />}{tab === 'Audit' && <Audit />}</main>);
}
function Dashboard({ asOf }) {
  const q = useApi('/accounts/summary' + (asOf ? '?asOf=' + asOf : '')); const [err, setErr] = useState('');
  const download = async (path, filename) => { try { const r = await fetch('/api' + path, { headers: { Authorization: 'Bearer ' + tok() } }); if (!r.ok) throw new Error('Export failed'); const u = URL.createObjectURL(await r.blob()); const a = document.createElement('a'); a.href = u; a.download = filename; a.click(); URL.revokeObjectURL(u); } catch { setErr('Export failed'); } };
  const tally = () => download('/accounts/tally.csv', 'tally-receipts.csv'); const tallyXml = () => download('/accounts/tally.xml', 'tally-vouchers.xml');
  return <Gate q={q}>{(d) => <>
    <div className="stats"><div><small>Outstanding</small><b>{inr(d.total.outstanding)}</b></div><div><small>60+ days late</small><b className="bad">{inr(d.total.d60p)}</b></div><div><small>Unmatched payments</small><b>{d.unmatched}</b></div><div><small>Counsellor tasks</small><b>{d.openTasks}</b></div></div><Reconciliation />
    <div className="row between"><h2>Dues by centre &amp; batch</h2><div className="row"><button className="btn sm" onClick={tally}>Export CSV</button><button className="btn sm ghost" onClick={tallyXml}>Export Tally XML</button></div></div>{err && <Err msg={err} />}
    <div className="scroll"><table><thead><tr><th>Centre</th><th>Batch</th><th>Outstanding</th><th>Current</th><th>1–30</th><th>31–60</th><th>60+</th></tr></thead><tbody>
      {d.rows.map((r) => <tr key={r.centre + r.batch}><td>{r.centre}</td><td>{r.batch}</td><td>{inr(r.outstanding)}</td><td>{inr(r.outstanding - r.d1_30 - r.d31_60 - r.d60p)}</td><td>{inr(r.d1_30)}</td><td>{inr(r.d31_60)}</td><td className={r.d60p ? 'bad' : ''}>{inr(r.d60p)}</td></tr>)}</tbody></table></div></>}</Gate>;
}
function Ledger({ asOf }) {
  const [s, setS] = useState(''); const q = useApi(`/accounts/students?q=${encodeURIComponent(s)}${asOf ? '&asOf=' + asOf : ''}`); const [open, setOpen] = useState(null);
  return (<><input className="search" placeholder="Search name or ID" value={s} onChange={(e) => setS(e.target.value)} />
    <Gate q={q}>{(rows) => rows.length ? rows.map((r) => <div key={r.id} className="card"><div className="row between" onClick={() => setOpen(open === r.id ? null : r.id)} style={{ cursor: 'pointer' }}>
      <div><b>{r.name}</b> <small className="muted">{r.sid} · {r.batch}</small>{r.risk?.flagged && <span className="chip">⚑ risk {r.risk.score}</span>}</div><div>{inr(r.balance)}{r.maxOverdue > 0 && <small className="bad"> · {r.maxOverdue}d overdue</small>}</div></div>
      {open === r.id && <table><thead><tr><th>#</th><th>Due</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>{r.instalments.map((i) => <tr key={i.id}><td>{i.no}</td><td>{i.dueDate}</td><td>{inr(i.amount)}</td><td>{inr(i.paid)}</td><td>{inr(i.balance)}</td><td>{i.status.replace('_', ' ')}{i.daysOverdue ? ` (${i.daysOverdue}d)` : ''}</td></tr>)}</tbody></table>}</div>) : <Empty>No students match</Empty>}</Gate></>);
}
function Refund() {
  const st = useApi('/accounts/students'); const [f, setF] = useState({ studentId: '', leaveDate: '' }), [r, setR] = useState(null), [err, setErr] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const go = (p, save) => async (e) => { e?.preventDefault(); setBusy(true); setErr(''); setMsg(''); try { const x = await api(p, { body: f }); setR(x); if (save) setMsg('Refund recorded'); } catch (x) { setErr(x.message); setR(null); } setBusy(false); };
  return (<Gate q={st}>{(rows) => <form className="narrow0" onSubmit={go('/accounts/refund/preview')}><h2>Pro-rata refund</h2>
    <label>Student<select value={f.studentId} onChange={(e) => setF({ ...f, studentId: e.target.value })} required><option value="">Select…</option>{rows.map((s) => <option key={s.id} value={s.id}>{s.sid} {s.name}</option>)}</select></label>
    <label>Leaving date<input type="date" value={f.leaveDate} onChange={(e) => setF({ ...f, leaveDate: e.target.value })} required /></label><button className="btn" disabled={busy}>{busy ? <Spinner /> : 'Calculate'}</button>
    {err && <Err msg={err} />}{msg && <p className="ok">{msg}</p>}
    {r && <div className="box"><Row k="Fees paid" v={inr(r.paid)} /><Row k={`Used (${r.daysUsed} days, pro-rata)`} v={'− ' + inr(r.consumed)} /><Row k="Admin fee (5%, max ₹5,000)" v={'− ' + inr(r.admin)} /><Row k="Includes GST on retained" v={inr(r.gstOnRetained)} />
      <Row k={<b>Refund</b>} v={<b>{inr(r.refund)}</b>} />{r.stillOwed > 0 && <Row k="Still owed by family" v={inr(r.stillOwed)} />}<p className="muted">Pay by {new Date(r.payBy).toLocaleDateString('en-IN')} (10 days from leaving)</p>
      <button type="button" className="btn" disabled={busy} onClick={go('/accounts/refund', true)}>Record refund</button></div>}</form>}</Gate>);
}
function Reconciliation() {
  const q = useApi('/accounts/reconciliation');
  return <Gate q={q}>{(d) => <div className="card"><b>Payment reconciliation</b><div className="stats"><div><small>Matched payments</small><b>{d.matched}</b><small>{inr(d.matchedAmount)}</small></div><div><small>Unmatched payments</small><b>{d.unmatched}</b><small>{inr(d.unmatchedAmount)}</small></div></div></div>}</Gate>;
}
function Audit() {
  const q = useApi('/accounts/audit');
  return <><h2>Staff activity log</h2><p className="muted">Recent refund, reconciliation, task and reminder actions.</p><Gate q={q}>{(rows) => rows.length ? <div className="scroll"><table><thead><tr><th>Time</th><th>Staff</th><th>Action</th><th>Details</th></tr></thead><tbody>{rows.map((r) => <tr key={r._id}><td>{new Date(r.createdAt).toLocaleString('en-IN')}</td><td>{r.actorName}</td><td>{r.action}</td><td>{JSON.stringify(r.details || {})}</td></tr>)}</tbody></table></div> : <Empty>No staff actions recorded yet</Empty>}</Gate></>;
}
const Row = ({ k, v }) => <div className="line"><span>{k}</span><span>{v}</span></div>;
function Queue() {
  const q = useApi('/accounts/queue'), tk = useApi('/accounts/tasks'), ins = useApi('/accounts/students'); const [pick, setPick] = useState({}), [err, setErr] = useState('');
  const act = async (fn) => { setErr(''); try { await fn(); q.reload(); tk.reload(); ins.reload(); } catch (e) { setErr(e.message); } };
  return (<><h2>Unmatched payments</h2>{err && <Err msg={err} />}<Gate q={q}>{(rows) => rows.length ? rows.map((p) => <div className="card" key={p._id}><div className="row between"><span>{p.ref} · <b>{inr(p.amount)}</b> <small className="muted">{p.note}</small></span></div>
    <div className="row"><select value={pick[p._id] || ''} onChange={(e) => setPick({ ...pick, [p._id]: e.target.value })}><option value="">Match to instalment…</option>{(ins.data || []).flatMap((s) => s.instalments.filter((i) => i.balance > 0).map((i) => <option key={i.id} value={i.id}>{s.sid} {s.name} · #{i.no} · {inr(i.balance)}</option>))}</select>
      <button className="btn sm" disabled={!pick[p._id]} onClick={() => act(() => api(`/accounts/queue/${p._id}/match`, { body: { instalmentId: pick[p._id] } }))}>Match</button></div></div>) : <Empty>Queue is clear</Empty>}</Gate>
    <h2>Counsellor call tasks <small className="muted">(AI dropout-risk flags: no fee action, no parent message)</small></h2>
    <Gate q={tk}>{(rows) => rows.length ? rows.map((t) => <div className="card" key={t._id}><div><b>{t.student.name}</b> <small className="muted">{t.student.sid} · {t.student.batch}</small> <span className="chip">risk {t.score}</span></div><p className="muted">{t.reason}</p>
      <div className="row"><button className="btn sm" onClick={() => act(() => api(`/accounts/tasks/${t._id}`, { method: 'PATCH', body: { status: 'done' } }))}>Call done</button><button className="btn sm ghost" onClick={() => act(() => api(`/accounts/tasks/${t._id}`, { method: 'PATCH', body: { status: 'false_flag' } }))}>False flag</button></div></div>) : <Empty>No open tasks</Empty>}</Gate></>);
}
function Reminders({ asOf }) {
  const q = useApi('/accounts/reminders'); const [m, setM] = useState(''), [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { const r = await api('/accounts/reminders/run', { body: asOf ? { asOf } : {} }); setM(`${r.sent} new reminder(s) queued`); q.reload(); } catch (e) { setM(e.message); } setBusy(false); };
  return (<><div className="row between"><h2>Reminder log</h2><button className="btn sm" disabled={busy} onClick={run}>Run reminders now</button></div><p className="muted">Runs daily at 09:00 IST. Unpaid instalments only, at −3, 0, +3, +7, +14 days. Stops when paid.</p>{m && <p className="ok">{m}</p>}
    <Gate q={q}>{(rows) => rows.length ? rows.map((r) => <div className="card" key={r._id}><small className="muted">{r.student?.sid} · {r.lang.toUpperCase()} · {r.channel} · offset {r.offset}</small><p>{r.text}</p></div>) : <Empty>No reminders yet. Pick a date and run.</Empty>}</Gate></>);
}
