// Mini-Markdown mit Formeln (wie mdHtml in src/neu/lerninhalte.ts), für die PDF-Skripte.
const path = require('path');
const katex = require(path.join(__dirname, '..', '..', 'node_modules', 'katex'));
const fehler = [];
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FORMEL = '\u0000F';
function formelnRaus(t) {
  const f = [];
  const put = (tex, block) => {
    try { katex.renderToString(tex, { throwOnError: true, displayMode: block, strict: false }); } catch (e) { fehler.push(tex + ' → ' + e.message); }
    f.push(katex.renderToString(tex, { throwOnError: false, displayMode: block, strict: false, output: 'html' }));
    return FORMEL + (f.length - 1) + '\u0000';
  };
  t = t.replace(/\$\$([\s\S]+?)\$\$/g, (_, x) => put(x.trim(), true));
  t = t.replace(/(^|[^\\])\$([^$\n]+?)\$/g, (_, v, x) => v + put(x, false));
  return { t, f };
}
const formelnRein = (h, f) => h.replace(/\u0000F(\d+)\u0000/g, (_, i) => f[+i]);
const inlineRoh = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<i>$2</i>');
// Bild als eigener Absatz: ![Bildunterschrift](/dateien/<modul>/<datei>.svg|png|jpg), Datei liegt in public/.
const BILD = /^!\[([^\]]*)\]\((\/dateien\/[\w./-]+\.(?:svg|png|jpe?g))\)$/;
function bloecke(text) {
  return text.split(/\n{2,}/).map((block) => {
    const zeilen = block.split('\n').filter((z, i, a) => z.trim() !== '' || (i > 0 && i < a.length - 1));
    if (!zeilen.length) return '';
    if (zeilen.length === 1 && zeilen[0].trim() === '---neue-seite---') return '<div class="lt-seite"></div>';
    const bild = zeilen.length === 1 ? zeilen[0].trim().match(BILD) : null;
    if (bild) return '<figure class="lt-bild"><img src="file://' + esc(path.join(__dirname, '..', '..', 'public', bild[2])) + '" alt="' + esc(bild[1]) + '">' + (bild[1] ? '<figcaption>' + inlineRoh(bild[1]) + '</figcaption>' : '') + '</figure>';
    if (zeilen.every((z) => z.trim().startsWith('|'))) {
      const rows = zeilen.filter((z) => !/^\s*\|[\s|:-]+\|\s*$/.test(z)).map((z) => z.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      const [kopf, ...rest] = rows;
      return '<div class="lt-tabwrap"><table class="lt-tab"><thead><tr>' + kopf.map((c) => '<th>' + inlineRoh(c) + '</th>').join('') + '</tr></thead><tbody>' + rest.map((r) => '<tr>' + r.map((c) => '<td>' + inlineRoh(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
    }
    if (zeilen.every((z) => z.startsWith('>'))) return '<div class="lt-regel">' + bloecke(zeilen.map((z) => z.replace(/^>\s?/, '')).join('\n')) + '</div>';
    return gruppen(zeilen);
  }).join('');
}
/** Zeilen eines Absatzes nach Art gruppieren: Liste (- / •), nummerierte Liste (1.), Überschrift (## / ### / ####), Text. */
function gruppen(zeilen) {
  const art = (z) => /^\s*[-•]\s/.test(z) ? 'ul' : /^\s*\d+\.\s/.test(z) ? 'ol' : /^#{2,4}\s/.test(z) ? 'h' : 'p';
  let html = '';
  for (let i = 0; i < zeilen.length;) {
    const a = art(zeilen[i]); let j = i; while (j < zeilen.length && art(zeilen[j]) === a && a !== 'h') j++; if (a === 'h') j = i + 1;
    const g = zeilen.slice(i, j);
    if (a === 'ul') html += '<ul>' + g.map((z) => '<li>' + inlineRoh(z.replace(/^\s*[-•]\s/, '')) + '</li>').join('') + '</ul>';
    else if (a === 'ol') html += '<ol start="' + parseInt(g[0]) + '">' + g.map((z) => '<li>' + inlineRoh(z.replace(/^\s*\d+\.\s/, '')) + '</li>').join('') + '</ol>';
    else if (a === 'h') { const n = g[0].match(/^#+/)[0].length; html += '<h' + n + ' class="lt-h">' + inlineRoh(g[0].replace(/^#+\s/, '')) + '</h' + n + '>'; }
    else html += '<p>' + g.map(inlineRoh).join('<br>') + '</p>';
    i = j;
  }
  return html;
}
const mdHtml = (text) => { const { t, f } = formelnRaus(text || ''); return formelnRein(bloecke(t), f); };


module.exports = { mdHtml, esc, fehler };
