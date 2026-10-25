// Hält das kostenlose Supabase-Projekt wach (es pausiert sonst nach ~1 Woche ohne Zugriffe).
// Wird täglich von Vercel aufgerufen (vercel.json → crons) und macht eine kleine Leseanfrage.
export default async function handler(req, res) {
  const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(500).json({ ok: false, fehler: 'Supabase-Umgebungsvariablen fehlen' });
  try {
    const r = await fetch(url + '/rest/v1/studiengaenge?select=id&limit=1', { headers: { apikey: key, Authorization: 'Bearer ' + key } });
    res.status(200).json({ ok: r.ok, status: r.status, zeit: new Date().toISOString() });
  } catch (e) {
    res.status(502).json({ ok: false, fehler: String(e) });
  }
}
