import { useT } from './i18n.js';
export const Lang = () => { const { lang, setLang } = useT(); return <button className="link" onClick={() => setLang(lang === 'hi' ? 'en' : 'hi')}>{lang === 'hi' ? 'English' : 'हिन्दी'}</button>; };
export const Spinner = () => <div className="spin" role="status" aria-label="Loading" />;
export const Err = ({ msg, retry }) => { const { t } = useT(); return <div className="box err" role="alert">{msg}{retry && <button className="btn sm" onClick={retry}>{t('retry')}</button>}</div>; };
export const Empty = ({ children }) => { const { t } = useT(); return <p className="muted center">{children || t('none')}</p>; };
export const Gate = ({ q, children }) => q.loading && !q.data ? <Spinner /> : q.err ? <Err msg={q.err} retry={q.reload} /> : children(q.data);
