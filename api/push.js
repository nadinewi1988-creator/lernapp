// Push-Erinnerungen der Lernapp (26.10.2026)
// Aufruf durch Vercel-Cron (vercel.json): ?art=morgen (täglich) und ?art=woche (sonntags).
// ?art=test schickt eine Testnachricht an die angemeldete Person (Authorization: Bearer <Zugangstoken>).
// Braucht in Vercel: SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY und VAPID_PRIVATE_KEY (VITE_SUPABASE_URL ist schon da).
// Schlüsselpaar erzeugt Nadine selbst unter /schluessel.html (bleibt auf ihrem Gerät).
// ?art=schluessel liefert nur den öffentlichen Schlüssel (für das Abo in der App).
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const tag = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
const plus = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dm = (iso) => iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.';
const zeit = (sek) => { const m = Math.round(sek / 60); return m < 60 ? m + ' Min.' : Math.floor(m / 60) + ' Std.' + (m % 60 ? ' ' + (m % 60) + ' Min.' : ''); };
const ART = { hausaufgabe: 'Hausaufgabe', frist: 'Frist', todo: 'To-do', termin: 'Termin' };

async function nachrichtMorgen(db, uid) {
  const h = tag(), m = plus(h, 1);
  const [ei, si, wd] = await Promise.all([
    db.from('eintraege').select('art,titel,datum').eq('user_id', uid).eq('erledigt', false).in('art', ['hausaufgabe', 'frist', 'todo']).gte('datum', h).lte('datum', m).order('datum'),
    db.from('sitzungen').select('id').eq('user_id', uid).eq('datum', h).eq('status', 'findet_statt'),
    db.from('wiederholung').select('frage_ref', { count: 'exact', head: true }).eq('user_id', uid).lte('faellig', h).neq('stand', 'sicher'),
  ]);
  const teile = [];
  const n = si.data?.length ?? 0;
  if (n) teile.push('Heute ' + n + (n === 1 ? ' Veranstaltung' : ' Veranstaltungen') + '.');
  for (const e of ei.data ?? []) teile.push((ART[e.art] ?? e.art) + (e.datum === h ? ' heute' : ' morgen') + ': ' + e.titel);
  if (wd.count) teile.push(wd.count + (wd.count === 1 ? ' Frage/Karte' : ' Fragen/Karten') + ' zur Wiederholung fällig.');
  if (!teile.length) return null;
  return { titel: 'Guten Morgen – dein Tag', text: teile.join('\n'), url: '/#/dashboard', tag: 'morgen' };
}

async function nachrichtWoche(db, uid) {
  const h = tag(), ab = plus(h, -6), bis = plus(h, 7);
  const [lz, an, si, ei] = await Promise.all([
    db.from('lernzeit').select('art,sekunden').eq('user_id', uid).gte('datum', ab).lte('datum', h),
    db.from('antworten').select('ergebnis').eq('user_id', uid).gte('zeitpunkt', ab + 'T00:00:00Z'),
    db.from('sitzungen').select('anwesenheit,status').eq('user_id', uid).gte('datum', ab).lte('datum', h),
    db.from('eintraege').select('art').eq('user_id', uid).eq('erledigt', false).in('art', ['hausaufgabe', 'frist']).gt('datum', h).lte('datum', bis),
  ]);
  const lern = (lz.data ?? []).filter((x) => x.art !== 'lerntext').reduce((s, x) => s + x.sekunden, 0);
  const lese = (lz.data ?? []).filter((x) => x.art === 'lerntext').reduce((s, x) => s + x.sekunden, 0);
  const a = an.data ?? [], r = a.filter((x) => x.ergebnis === 'richtig').length;
  const st = (si.data ?? []).filter((x) => x.status === 'findet_statt'), da = st.filter((x) => x.anwesenheit === 'ja').length, offen = st.filter((x) => x.anwesenheit === 'offen').length;
  const teile = ['Lernzeit: ' + zeit(lern) + (lese ? ' · Lesezeit: ' + zeit(lese) : '')];
  if (a.length) teile.push(a.length + ' Antworten · ' + Math.round((r / a.length) * 100) + ' % richtig');
  if (st.length) teile.push('Anwesend: ' + da + ' von ' + st.length + (offen ? ' (' + offen + ' ohne Angabe)' : ''));
  const f = ei.data?.length ?? 0;
  if (f) teile.push('Nächste Woche: ' + f + (f === 1 ? ' Hausaufgabe/Frist' : ' Hausaufgaben/Fristen'));
  return { titel: 'Dein Wochenrückblick (' + dm(ab) + '–' + dm(h) + ')', text: teile.join('\n'), url: '/#/statistik', tag: 'woche' };
}

export default async function handler(req, res) {
  const url = process.env.VITE_SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY, priv = process.env.VAPID_PRIVATE_KEY, VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
  const art = String(req.query.art ?? '');
  if (art === 'schluessel') return VAPID_PUBLIC ? res.status(200).json({ ok: true, publicKey: VAPID_PUBLIC }) : res.status(500).json({ ok: false, fehler: 'In Vercel fehlt noch VAPID_PUBLIC_KEY' });
  const fehlt = [!service && 'SUPABASE_SERVICE_ROLE_KEY', !VAPID_PUBLIC && 'VAPID_PUBLIC_KEY', !priv && 'VAPID_PRIVATE_KEY', !url && 'VITE_SUPABASE_URL'].filter(Boolean);
  if (fehlt.length) return res.status(500).json({ ok: false, fehler: 'In Vercel fehlt noch ' + fehlt.join(', ') });
  if (!['morgen', 'woche', 'test'].includes(art)) return res.status(400).json({ ok: false, fehler: 'art fehlt' });
  const db = createClient(url, service, { auth: { persistSession: false } });

  let nurUid = null;
  if (art === 'test') {
    const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ ok: false, fehler: 'nicht angemeldet' });
    nurUid = data.user.id;
  } else if (!String(req.headers['user-agent'] ?? '').includes('vercel-cron') && !(process.env.CRON_SECRET && req.headers.authorization === 'Bearer ' + process.env.CRON_SECRET)) {
    return res.status(403).json({ ok: false, fehler: 'nur für den Zeitplan' });
  }

  webpush.setVapidDetails('mailto:lernapp@example.com', VAPID_PUBLIC, priv);
  let q = db.from('einstellungen').select('user_id,benachrichtigungen');
  if (nurUid) q = q.eq('user_id', nurUid);
  const { data: rows, error } = await q;
  if (error) return res.status(500).json({ ok: false, fehler: error.message });

  let gesendet = 0; const fehler = [];
  for (const row of rows ?? []) {
    const b = row.benachrichtigungen ?? {}, p = b.push ?? {}, abos = p.abos ?? [];
    if (!abos.length) continue;
    if ((art === 'morgen' && p.morgen === false) || (art === 'woche' && p.woche === false)) continue;
    const msg = art === 'test' ? { titel: 'Lernapp', text: 'Test: Erinnerungen funktionieren 🎉', url: '/#/dashboard', tag: 'test' }
      : art === 'morgen' ? await nachrichtMorgen(db, row.user_id) : await nachrichtWoche(db, row.user_id);
    if (!msg) continue;
    const kaputt = [];
    for (const a of abos) {
      try { await webpush.sendNotification({ endpoint: a.endpoint, keys: a.keys }, JSON.stringify(msg), { TTL: 6 * 3600 }); gesendet++; }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) kaputt.push(a.endpoint); else fehler.push(String(e.statusCode ?? e.message)); }
    }
    if (kaputt.length) await db.from('einstellungen').update({ benachrichtigungen: { ...b, push: { ...p, abos: abos.filter((a) => !kaputt.includes(a.endpoint)) } } }).eq('user_id', row.user_id);
  }
  res.status(200).json({ ok: true, art, gesendet, fehler });
}
