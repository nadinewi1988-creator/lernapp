import { useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, syncEnabled } from '../supabase';
import { ersteinrichtung, ladeStudienstand, type Studienstand } from './db';
import { wochencheckBereitstellen } from './wochencheck';
import { aktuellesSemester } from './pruefungslogik';
import { DEMO, demoStand } from './demo';
import { Pruefungen } from './pages/Pruefungen';
import { Kalender } from './pages/Kalender';
import { Dashboard } from './pages/Dashboard';
import { Module } from './pages/Module';
import { Karten } from './pages/Karten';
import { Statistik } from './pages/Statistik';
import './theme.css';

export type Seite = 'dashboard' | 'kalender' | 'module' | 'pruefungen' | 'karten' | 'statistik';
const SEITEN: { id: Seite; name: string; kurz: string; icon: ReactNode }[] = [
  { id: 'dashboard', name: 'Dashboard', kurz: 'Dashboard', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></svg> },
  { id: 'kalender', name: 'Kalender', kurz: 'Kalender', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg> },
  { id: 'module', name: 'Module', kurz: 'Module', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h12a4 4 0 014 4v12H8a4 4 0 01-4-4z" /></svg> },
  { id: 'pruefungen', name: 'Prüfungen', kurz: 'Prüfungen', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" /><path d="M14 3v6h6M9 15l2 2 4-4" /></svg> },
  { id: 'karten', name: 'Eigene Karten', kurz: 'Karten', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="6" width="14" height="14" rx="2" /><path d="M7 6V5a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2h-2" /></svg> },
  { id: 'statistik', name: 'Statistik', kurz: 'Statistik', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 20h16" /><path d="M7 16v-5M12 16V6M17 16v-8" /></svg> },
];
export const UNTER: Partial<Record<Seite, { id: string; name: string }[]>> = {
  pruefungen: [{ id: 'meine', name: 'Meine Prüfungen' }, { id: 'bafoeg', name: 'BAföG' }, { id: 'regeln', name: 'Regeln & Ordnungen' }],
  karten: [{ id: 'aktuell', name: 'Aktuelles Semester' }, { id: 'archiv', name: 'Archiv' }],
  statistik: [{ id: 'uebersicht', name: 'Übersicht' }, { id: 'karten', name: 'Eigene Karten' }],
};

function useUser() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    if (DEMO) { setUser({ id: 'demo', email: 'demo' } as User); return; }
    if (!syncEnabled) { setUser(null); return; }
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  return user;
}

function leseOrt(): { seite: Seite; unter: string; teil: string } {
  let [s, u, t] = window.location.hash.replace(/^#\/?/, '').split('/');
  if (s === 'karten' && u === 'statistik') { s = 'statistik'; u = 'karten'; t = ''; }
  const seite = (SEITEN.find((x) => x.id === s)?.id ?? 'dashboard') as Seite;
  return { seite, unter: u ?? (seite === 'module' ? '' : UNTER[seite]?.[0]?.id ?? ''), teil: t ?? '' };
}

export default function App() {
  const user = useUser();
  const [ort, setOrt] = useState(leseOrt());
  const [stand, setStand] = useState<Studienstand | null>(null);
  const [fehler, setFehler] = useState('');
  // Verlauf innerhalb der App (für „← Zurück“), bleibt erhalten, solange die App offen ist
  const [verlauf, setVerlauf] = useState<string[]>(() => { try { return JSON.parse(sessionStorage.getItem('verlauf') || '[]'); } catch { return []; } });
  useEffect(() => {
    const merk = () => { const h = window.location.hash || '#/'; setVerlauf((v) => { let n = v.length && v[v.length - 1] === h ? v : v.length > 1 && v[v.length - 2] === h ? v.slice(0, -1) : [...v, h].slice(-50); try { sessionStorage.setItem('verlauf', JSON.stringify(n)); } catch { /* egal */ } return n; }); };
    merk();
    const f = () => { setOrt(leseOrt()); merk(); }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f);
  }, []);
  const gehe = (seite: Seite, unter?: string, teil?: string) => { window.location.hash = '/' + seite + (unter ? '/' + unter : '') + (unter && teil ? '/' + teil : ''); window.scrollTo(0, 0); };

  async function neuLaden() {
    if (DEMO) { setStand(demoStand()); return; }
    try { setStand(await ladeStudienstand()); } catch (e) { setFehler(String((e as Error).message || e)); }
  }
  useEffect(() => {
    if (!user) return;
    (async () => { try { if (!DEMO) await ersteinrichtung(); await neuLaden(); if (!DEMO) { let t: ReturnType<typeof setTimeout> | undefined; wochencheckBereitstellen(() => { clearTimeout(t); t = setTimeout(() => { neuLaden(); }, 1500); }); } } catch (e) { setFehler(String((e as Error).message || e)); } })();
  }, [user]);

  if (user === undefined) return <div className="anmelden"><span className="klein-text">Lade …</span></div>;
  if (!user) return <Anmelden />;

  const akt = stand ? aktuellesSemester(stand.semester) : undefined;
  return (
    <div className="app">
      <nav className="seitenleiste" aria-label="Hauptnavigation">
        <div className="logo">
          <span className="logo-symbol"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1f2328" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 7l10-4 10 4-10 4z" /><path d="M6 9v5c0 1.7 2.7 3 6 3s6-1.3 6-3V9" /></svg></span>
          <span className="logo-text"><b>Lernapp</b><span>{akt?.bezeichnung ?? ''}</span><span>{akt ? akt.fachsemester + '. Fachsemester' : ''}</span></span>
        </div>
        {SEITEN.map((s) => (
          <div key={s.id}>
            <button className={'nav-link' + (ort.seite === s.id ? ' aktiv' : '')} onClick={() => gehe(s.id)}>{s.icon}{s.name}</button>
            {ort.seite === s.id && s.id === 'module' && stand && (() => {
              const akt = aktuellesSemester(stand.semester);
              const m = stand.module.find((x) => x.kuerzel === ort.unter);
              const aktivNr = /^s\d$/.test(ort.unter) ? +ort.unter.slice(1) : m ? stand.semester.find((x) => x.id === m.plan_semester_id)?.fachsemester : akt?.fachsemester;
              return <div className="nav-unter nav-unter-weiss">{stand.semester.map((x) => <button key={x.id} className={aktivNr === x.fachsemester ? 'aktiv' : ''} onClick={() => gehe('module', 's' + x.fachsemester)}>{x.fachsemester}. Semester{x.id === akt?.id && <span title="aktuelles Semester" style={{ width: 6, height: 6, borderRadius: '50%', background: '#2f7a4b', display: 'inline-block', marginLeft: 8, verticalAlign: 'middle' }} />}</button>)}</div>;
            })()}
            {ort.seite === s.id && UNTER[s.id] && (
              <div className="nav-unter">{UNTER[s.id]!.map((u) => <button key={u.id} className={ort.unter === u.id ? 'aktiv' : ''} onClick={() => gehe(s.id, u.id)}>{u.name}</button>)}</div>
            )}
          </div>
        ))}
        <div style={{ marginTop: 'auto', padding: '0 12px', fontSize: 12, color: 'var(--ink-3)' }}>
          {user.email} · <button className="link-knopf" onClick={() => supabase.auth.signOut()}>Abmelden</button>
        </div>
      </nav>
      <main className="inhalt">
        {verlauf.length > 1 && <button type="button" className="zurueck-knopf" onClick={() => window.history.back()}>← Zurück</button>}
        {fehler && <div className="karte fehler">Fehler beim Laden: {fehler}</div>}
        {!stand && !fehler && <span className="klein-text">Lade deinen Studienverlauf …</span>}
        {stand && ort.seite === 'pruefungen' && <Pruefungen stand={stand} unter={ort.unter} gehe={(u) => gehe('pruefungen', u)} neuLaden={neuLaden} />}
        {stand && ort.seite === 'dashboard' && <Dashboard stand={stand} neuLaden={neuLaden} gehe={(s, u) => gehe(s as Seite, u)} />}
        {stand && ort.seite === 'module' && <Module stand={stand} unter={ort.unter} teil={ort.teil} gehe={(u, t) => gehe('module', u, t)} neuLaden={neuLaden} />}
        {stand && ort.seite === 'kalender' && <Kalender stand={stand} neuLaden={neuLaden} />}
        {stand && ort.seite === 'karten' && <Karten stand={stand} unter={ort.unter} gehe={(u) => gehe('karten', u)} neuLaden={neuLaden} />}
        {stand && ort.seite === 'statistik' && <Statistik stand={stand} unter={ort.unter} gehe={(u) => gehe('statistik', u)} neuLaden={neuLaden} />}
        {stand && ort.seite !== 'pruefungen' && ort.seite !== 'kalender' && ort.seite !== 'dashboard' && ort.seite !== 'module' && ort.seite !== 'karten' && ort.seite !== 'statistik' && <Baustelle name={SEITEN.find((s) => s.id === ort.seite)!.name} />}
      </main>
      <nav className="untennav" aria-label="Navigation">
        {SEITEN.map((s) => <button key={s.id} className={ort.seite === s.id ? 'aktiv' : ''} onClick={() => gehe(s.id)}>{s.icon}{s.kurz}</button>)}
      </nav>
    </div>
  );
}

function Baustelle({ name }: { name: string }) {
  return (
    <>
      <header className="kopf"><div><h1>{name}</h1><div className="unter">Neuaufbau – diese Seite folgt als Nächstes</div></div></header>
      <div className="karte klein-text">Diese Seite wird gerade nach dem Entwurf gebaut. Fertig sind bereits Dashboard, Kalender, Module und Prüfungen.</div>
    </>
  );
}

function Anmelden() {
  const [mail, setMail] = useState('');
  const [gesendet, setGesendet] = useState(false);
  if (!syncEnabled) return <div className="anmelden"><div className="karte">Keine Supabase-Verbindung eingerichtet (Umgebungsvariablen fehlen).</div></div>;
  return (
    <div className="anmelden">
      <div className="karte">
        <span className="logo-symbol"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1f2328" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z" /><path d="M6 12v5c3 2 9 2 12 0v-5" /></svg></span>
        <b style={{ fontSize: 22 }}>Lernapp</b>
        <button className="knopf gross" onClick={() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })}>Mit Google anmelden</button>
        {gesendet ? <span className="klein-text">Link gesendet – bitte E-Mail-Postfach prüfen.</span> : (
          <form onSubmit={async (e) => { e.preventDefault(); await supabase.auth.signInWithOtp({ email: mail, options: { emailRedirectTo: window.location.origin } }); setGesendet(true); }} style={{ display: 'flex', gap: 8, width: '100%' }}>
            <input className="feld" style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 999, padding: '8px 14px' }} type="email" placeholder="oder E-Mail für Anmeldelink" value={mail} onChange={(e) => setMail(e.target.value)} />
            <button className="knopf" type="submit">Senden</button>
          </form>
        )}
      </div>
    </div>
  );
}
