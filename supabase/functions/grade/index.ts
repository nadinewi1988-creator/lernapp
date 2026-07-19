import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const MODELS = ['claude-sonnet-4-5-20250929','claude-3-5-sonnet-20241022','claude-sonnet-4-6','claude-3-5-sonnet-latest'];
async function callAnthropic(apiKey, system, user) {
  let lastErr = '';
  for (const model of MODELS) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model, max_tokens: 700, system, messages: [{ role: 'user', content: user }] }) });
    if (resp.ok) { const data = await resp.json(); const text = (data.content ?? []).map((b) => b.type === 'text' ? b.text : '').join('') || ''; return { ok: true, text }; }
    const errText = await resp.text(); lastErr = `HTTP ${resp.status}: ${errText}`;
    const isModelError = resp.status === 404 || errText.includes('model') || errText.includes('not_found');
    if (!isModelError) break;
  }
  return { ok: false, text: lastErr };
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
    if (!apiKey) return new Response(JSON.stringify({ text: 'FEHLER: ANTHROPIC_API_KEY ist nicht gesetzt.' }), { headers: { ...CORS, 'content-type': 'application/json' } });
    const { frage, musterantwort, nutzerantwort, mode } = await req.json();
    const system = mode === 'hilfe' ? 'Du bist eine geduldige Tutorin. Erkläre das Thema der Frage noch einmal einfach und ermutigend, mit einem Alltagsbeispiel. Kurz, klar, auf Deutsch.' : 'Du bewertest die Antwort einer Studentin auf eine Prüfungsfrage. Vergleiche ihre Antwort mit der Musterantwort. Antworte NUR mit JSON: {"prozent": <0-100>, "feedback": "<2-3 Sätze konkretes Feedback>"}. Kein Markdown.';
    const user = mode === 'hilfe' ? `Frage: ${frage}\nMusterantwort: ${musterantwort}` : `Frage: ${frage}\nMusterantwort: ${musterantwort}\nAntwort der Studentin: ${nutzerantwort}`;
    const result = await callAnthropic(apiKey, system, user);
    if (!result.ok) return new Response(JSON.stringify({ text: 'FEHLER von Anthropic: ' + result.text }), { headers: { ...CORS, 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ text: result.text }), { headers: { ...CORS, 'content-type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ text: 'FEHLER: ' + String(e) }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
  }
});
