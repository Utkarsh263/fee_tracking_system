import React, { useState } from 'react'; import { createRoot } from 'react-dom/client'; import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LangCtx } from './i18n.js'; import { role } from './api.js'; import Login from './Login.jsx'; import Parent from './Parent.jsx'; import Pay from './Pay.jsx'; import Accounts from './Accounts.jsx'; import './style.css';
function App() {
  const [lang, setL] = useState(localStorage.getItem('lang') || 'hi'); const setLang = (l) => { localStorage.setItem('lang', l); setL(l); };
  const r = role(); const home = r === 'accounts' ? '/accounts' : r === 'parent' ? '/parent' : null;
  return (<LangCtx.Provider value={{ lang, setLang }}><BrowserRouter><Routes>
    <Route path="/" element={home ? <Navigate to={home} /> : <Login />} />
    <Route path="/parent" element={r === 'parent' ? <Parent /> : <Navigate to="/" />} />
    <Route path="/accounts" element={r === 'accounts' ? <Accounts /> : <Navigate to="/" />} />
    <Route path="/pay/:id" element={<Pay />} /><Route path="*" element={<Navigate to="/" />} />
  </Routes></BrowserRouter></LangCtx.Provider>);
}
createRoot(document.getElementById('root')).render(<App />);
