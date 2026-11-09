import { useEffect, useState, useCallback } from 'react';
export const tok = () => localStorage.getItem('tok');
export const setTok = (t) => (t ? localStorage.setItem('tok', t) : localStorage.removeItem('tok'));
export const role = () => { try { return JSON.parse(atob(tok().split('.')[1])).role; } catch { return null; } };
export async function api(p, o = {}) {
  const r = await fetch('/api' + p, { method: o.method || (o.body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', ...(tok() ? { Authorization: 'Bearer ' + tok() } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
  if (r.status === 401 && tok()) { setTok(null); location.href = '/'; }
  if (o.text) return r.text();
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong'), { data: j });
  return j;
}
export function useApi(path) {
  const [s, set] = useState({ data: null, err: null, loading: true });
  const load = useCallback(() => { set((x) => ({ ...x, loading: true })); api(path).then((data) => set({ data, err: null, loading: false })).catch((err) => set({ data: null, err: err.message, loading: false })); }, [path]);
  useEffect(load, [load]); return { ...s, reload: load };
}
export const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
