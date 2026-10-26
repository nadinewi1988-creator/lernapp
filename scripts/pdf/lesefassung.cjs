// Lesefassung einer Sitzungsdatei als PDF (KaTeX, Schema 2a/5h).
// Aufruf: node scripts/pdf/lesefassung.cjs content/<modul>/<sitzung>.json <out.pdf> "<Modulname>"
const fs = require('fs'), path = require('path');
const { mdHtml, esc, fehler } = require('./md.cjs');
const { chromium } = require('playwright');
const NM = path.join(__dirname, '..', '..', 'node_modules') + '/';
const [, , src, out, modulname] = process.argv;
const d = JSON.parse(fs.readFileSync(src, 'utf8'));
const inl = (t) => mdHtml(t || '').replace(/^<p>([\s\S]*)<\/p>$/, '$1');
// Art (Vorlesung/Seminar/…) aus _modul.json im selben Ordner, sonst wie bisher: .1 = Vorlesung
let tmArt = null;
try { const m = JSON.parse(fs.readFileSync(path.join(path.dirname(src), '_modul.json'), 'utf8')); tmArt = (m.teilmodule || []).find((t) => t.id === d.teilmodul)?.art || null; } catch (e) {}
const vl = tmArt ? tmArt === 'Vorlesung' : d.teilmodul.endsWith('.1');
const datum = d.datum.split('-').reverse().join('.');
const P = [];
P.push(`<header><div class="kicker">${esc(d.modul)} · ${esc(modulname)} · ${esc(d.teilmodul)} ${tmArt || (vl ? 'Vorlesung' : 'Seminar')} · ${datum}</div><h1>${inl(d.thema)}</h1><div class="src">Quellen: ${d.quellen.map((q) => esc(q.datei.split('/').pop()) + ' (' + esc(q.seiten) + ')').join('; ')}</div></header>`);
if (d.pruefungshinweise?.length) P.push(`<section class="warn"><h2>Prüfungshinweise</h2><ul>${d.pruefungshinweise.map((p) => '<li>' + inl(p) + '</li>').join('')}</ul></section>`);
P.push(`<section><h2>Lernziele</h2><ul>${d.lernziele.map((l) => '<li>' + inl(l.text) + (l.art === 'vorgegeben' ? ' <span class="tag">vorgegeben</span>' : '') + '</li>').join('')}</ul></section>`);
P.push(`<section><h2>Kurzfassung</h2><ol>${d.kurzfassung.map((k) => '<li>' + inl(k) + '</li>').join('')}</ol></section>`);
if (d.erklaerung?.length) {
  P.push('<section><h2>Erklärung</h2>');
  for (const a of d.erklaerung) {
    P.push(`<h3>${inl(a.titel)} <span class="fol">${vl && a.folien ? 'Folien ' : ''}${esc(a.folien || '')}</span></h3><div class="md">${mdHtml(a.text)}</div>`);
    if (a.beispiel) P.push(`<div class="bsp"><b>Beispiel:</b> ${mdHtml(a.beispiel)}</div>`);
  }
  P.push('</section>');
}
if (d.definitionen?.length) P.push('<section><h2>Begriffe</h2>' + d.definitionen.map((b) => `<div class="def"><div class="b">${inl(b.begriff)} <span class="fol">${esc(b.folie || '')}</span></div><div class="w">„${inl(b.wortlaut)}“</div><div>${inl(b.erklaerung)}</div></div>`).join('') + '</section>');
const auf = d.aufgaben.filter((a) => !/hausaufgabe/i.test(a.art));
const ha = d.aufgaben.filter((a) => /hausaufgabe/i.test(a.art));
if (auf.length) P.push('<section><h2>Aufgaben aus dem Material mit Lösung</h2>' + auf.map((a) => `<div class="auf"><div class="b">${esc(a.quelle)}</div><div class="w">${mdHtml(a.text)}</div><div><b>Lösung:</b> ${mdHtml(a.loesung)}</div>${a.loesungsweg ? `<div><b>Lösungsweg:</b> ${mdHtml(a.loesungsweg)}</div>` : ''}</div>`).join('') + '</section>');
if (ha.length) P.push('<section class="ha"><h2>Hausaufgaben</h2><ul>' + ha.map((a) => `<li><b>${inl(a.titel || a.quelle)}</b> – ${a.pdf ? 'Aufgaben und Lösungen in der eigenen PDF <i>' + esc(a.pdf.split('/').pop()) + '</i>' : 'persönliche Ausarbeitung in deinem Ordner (nicht in der App)'}</li>`).join('') + '</ul></section>');
if (d.offene_fragen?.length) P.push(`<section class="ask"><h2>Nachfragen in der Uni</h2><ol>${d.offene_fragen.map((q) => '<li>' + inl(q) + '</li>').join('')}</ol></section>`);
P.push(`<footer>„Ergänzung“ = nicht aus der Vorlesung, zum Verständnis ergänzt. Erstellt mit Claude für die Lernapp, Stand ${d.stand === 'geprueft' ? 'geprüft' : esc(d.stand)}.</footer>`);
if (fehler.length) { console.error('KaTeX-Fehler:\n' + fehler.join('\n')); process.exit(1); }
const kcss = fs.readFileSync(NM + 'katex/dist/katex.min.css', 'utf8').replace(/url\(fonts\//g, 'url(file://' + NM + 'katex/dist/fonts/');
const css = `${kcss}
body{font-family:'Source Sans 3','Helvetica Neue',Arial,sans-serif;color:#1d2433;font-size:10.5pt;line-height:1.5}
.kicker{color:#3d5a8a;font-weight:700;font-size:8.8pt;text-transform:uppercase;letter-spacing:.04em}
h1{font-size:18pt;margin:4px 0 6px;color:#24406e}.src{color:#5a6578;font-size:8.5pt}
h2{font-size:13pt;border-bottom:2px solid #dfe6f2;padding-bottom:3px;margin-top:20px;color:#24406e;break-after:avoid}
h3{font-size:11pt;margin:14px 0 4px;break-after:avoid}h4,h5{font-size:10.5pt;margin:10px 0 3px}
.fol{color:#5a6578;font-weight:400;font-size:8.5pt}.tag{background:#eef0f3;border-radius:4px;padding:0 5px;font-size:8pt;color:#4b5563}
.warn{background:#fde9e9;border-radius:8px;padding:2px 12px 6px}.warn h2{border:0;color:#c42b2b}
.ask{background:#fffaf0;border-radius:8px;padding:2px 12px 6px}.ask h2{border:0;color:#9a6b00}
.ha{background:#fff8e1;border-radius:8px;padding:2px 12px 6px}.ha h2{border:0;color:#8a6500}
.bsp{background:#eef3fb;border-radius:6px;padding:4px 10px;margin:6px 0}.bsp p{margin:2px 0}
.def,.auf{border-left:3px solid #3d5a8a;padding:4px 10px;margin:8px 0}.def{break-inside:avoid}.auf .b,.auf .w{break-after:avoid}.def .b,.auf .b{font-weight:700}
.w{color:#3f4756;margin:2px 0 4px}.def .w{font-style:italic}
p{margin:4px 0}ul,ol{margin:4px 0;padding-left:22px}li{margin:2px 0}
.lt-bild{margin:8px 0 12px;text-align:center;break-inside:avoid}.lt-bild img{max-width:75%}.lt-bild figcaption{font-size:9pt;color:#5a6578}
.lt-regel{background:#f3f6fb;border-left:4px solid #8195b8;padding:6px 12px;margin:8px 0;border-radius:3px;break-inside:avoid}
table{border-collapse:collapse;margin:6px 0;font-size:9.6pt}td,th{border:1px solid #c9d3e3;padding:2px 8px;text-align:left}th{background:#eef2f8}
.katex{font-size:1.06em}.katex-display{margin:6px 0}
footer{margin-top:24px;color:#5a6578;font-size:8pt}`;
const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>${css}</style></head><body>${P.join('')}</body></html>`;
fs.writeFileSync(out.replace(/\.pdf$/, '.html'), html);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file://' + path.resolve(out.replace(/\.pdf$/, '.html'))); await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: out, format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="font-size:10px;color:#333;width:100%;text-align:center;padding-top:2px;">' + esc(d.teilmodul + ' · ' + datum) + ' · <b>Seite <span class="pageNumber"></span> von <span class="totalPages"></span></b></div>',
    margin: { top: '16mm', bottom: '16mm', left: '16mm', right: '16mm' } });
  await b.close(); console.log('ok', out);
})();
