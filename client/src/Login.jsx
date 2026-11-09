import { useState } from 'react'; import { api, setTok } from './api.js'; import { useT } from './i18n.js'; import { Lang, Err } from './ui.jsx';
export default function Login() {
  const { t } = useT(); const [mode, setMode] = useState('parent'); const [f, setF] = useState({ phone: '', otp: '', email: '', password: '', consent: false });
  const [step, setStep] = useState(1), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [dev, setDev] = useState(''), [needConsent, setNC] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const run = (fn) => async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await fn(); } catch (x) { if (x.data?.needConsent) setNC(true); setErr(x.message); } setBusy(false); };
  const done = (r) => { setTok(r.token); location.href = '/'; };
  return (<main className="narrow"><div className="row between"><h1>FeeDesk</h1><Lang /></div>
    {mode === 'parent' ? (step === 1
      ? <form onSubmit={run(async () => { const r = await api('/auth/otp', { body: { phone: f.phone } }); setDev(r.devOtp || ''); setStep(2); })}>
        <label>{t('phone')}<input inputMode="numeric" maxLength={10} value={f.phone} onChange={set('phone')} placeholder="9000000001" required /></label><button className="btn" disabled={busy || f.phone.length !== 10}>{t('send')}</button></form>
      : <form onSubmit={run(async () => done(await api('/auth/verify', { body: { phone: f.phone, otp: f.otp, consent: f.consent } })))}>
        <label>{t('otp')}<input inputMode="numeric" maxLength={6} value={f.otp} onChange={set('otp')} required autoFocus /></label>
        {dev && <p className="muted">Demo OTP: <b>{dev}</b></p>}
        {needConsent && <label className="check"><input type="checkbox" checked={f.consent} onChange={set('consent')} /><span>{t('consent')}</span></label>}
        <button className="btn" disabled={busy || f.otp.length !== 6}>{t('verify')}</button></form>)
      : <form onSubmit={run(async () => done(await api('/auth/login', { body: { email: f.email, password: f.password } })))}>
        <label>Email<input type="email" value={f.email} onChange={set('email')} placeholder="accounts@demo.test" required /></label>
        <label>Password<input type="password" value={f.password} onChange={set('password')} required /></label><button className="btn" disabled={busy}>Log in</button></form>}
    {err && <Err msg={err} />}
    <button className="link" onClick={() => { setMode(mode === 'parent' ? 'staff' : 'parent'); setErr(''); setStep(1); }}>{mode === 'parent' ? t('staff') : 'Parent login'}</button></main>);
}
