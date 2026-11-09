import { useState } from 'react'; import { useParams, Link } from 'react-router-dom'; import { api, useApi, inr } from './api.js'; import { Gate, Err } from './ui.jsx';
export default function Pay() {
  const { id } = useParams(); const q = useApi('/checkout/' + id); const [res, setRes] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const go = async (outcome) => { setBusy(true); setErr(''); try { setRes((await api('/checkout/' + id, { body: { outcome } })).ok ? 'ok' : 'fail'); } catch (e) { setErr(e.message); } setBusy(false); };
  return (<main className="narrow"><p className="muted">Test-mode payment gateway (no real money)</p>
    <Gate q={q}>{(d) => res === 'ok' ? <section className="due"><div className="big ok">✓ {inr(d.balance)}</div><p>Payment received</p><Link className="btn" to="/">Back</Link></section>
      : <section className="due"><div className="muted">{d.student} · Instalment {d.no}</div><div className="big">{inr(d.balance)}</div>
        {res === 'fail' && <Err msg="Payment failed. You were not charged." />}{err && <Err msg={err} />}
        <button className="btn lg" disabled={busy} onClick={() => go('success')}>Pay (simulate success)</button><button className="btn ghost" disabled={busy} onClick={() => go('fail')}>Simulate failure</button></section>}</Gate></main>);
}
