// Lösungs-PDF eines Übungsblatts (Schema 5f/5h).
// Aufruf: node scripts/pdf/loesung.cjs <loesung.md> <out.pdf> "<Titel>" "<Untertitel>"
// loesung.md = Inhalt von h01.loesung (echte Backslashes); `---neue-seite---` = Seitenumbruch.
const fs = require('fs');
const path = require('path');
const NM = path.join(__dirname, '..', '..', 'node_modules') + '/';
const { chromium } = require('playwright');

const { mdHtml, esc, fehler } = require('./md.cjs');

(async () => {
  const [, , inp, out, titel, unter] = process.argv;
  const body = mdHtml(fs.readFileSync(inp, 'utf8'));
  if (fehler.length) { console.error('KaTeX-Fehler:\n' + fehler.join('\n')); process.exit(1); }
  const css = fs.readFileSync(NM + 'katex/dist/katex.min.css', 'utf8').replace(/url\(fonts\//g, 'url(file://' + NM + 'katex/dist/fonts/');
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>${css}
  @page { size: A4; margin: 18mm 17mm 18mm 17mm; }
  body { font-family: 'Source Sans 3','Source Sans Pro','Helvetica Neue',Arial,sans-serif; font-size: 10.6pt; line-height: 1.5; color: #1d2433; }
  .kopf { border-bottom: 2px solid #3d5a8a; padding-bottom: 6px; margin-bottom: 14px; }
  .kopf h1 { font-size: 17pt; margin: 0; color: #24406e; } .kopf div { color: #5a6578; font-size: 9.5pt; margin-top: 2px; }
  h2.lt-h { font-size: 13.5pt; color: #24406e; margin: 20px 0 6px; border-bottom: 1px solid #c9d3e3; padding-bottom: 2px; }
  h3.lt-h { font-size: 12pt; color: #24406e; margin: 18px 0 6px; break-after: avoid; }
  h4.lt-h { font-size: 11pt; color: #3d5a8a; margin: 14px 0 4px; break-after: avoid; }
  p { margin: 5px 0; } ul, ol { margin: 4px 0 6px; padding-left: 22px; } li { margin: 2px 0; }
  .lt-regel { background: #f3f6fb; border-left: 4px solid #8195b8; padding: 6px 12px; margin: 8px 0; border-radius: 3px; break-inside: avoid; }
  .lt-regel p { margin: 4px 0; }
  .lt-tabwrap { margin: 8px 0; break-inside: avoid; }
  table { border-collapse: collapse; font-size: 9.8pt; } th, td { border: 1px solid #c9d3e3; padding: 3px 8px; text-align: left; vertical-align: top; }
  th { background: #eef2f8; }
  .lt-bild { margin: 8px 0 12px; text-align: center; break-inside: avoid; } .lt-bild img { max-width: 100%; } .lt-bild figcaption { font-size: 9pt; color: #5a6578; }
  .lt-seite { break-before: page; height: 0; }
  .katex { font-size: 1.08em; } .katex-display { margin: 6px 0; overflow-x: auto; overflow-y: hidden; }
  </style></head><body><div class="kopf"><h1>${esc(titel)}</h1><div>${esc(unter)}</div></div>${body}</body></html>`;
  fs.writeFileSync(out.replace(/\.pdf$/, '.html'), html);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(out.replace(/\.pdf$/, '.html')));
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: out, format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="font-size:10px;color:#333;width:100%;text-align:center;padding-top:2px;">' + esc(titel) + ' · <b>Seite <span class="pageNumber"></span> von <span class="totalPages"></span></b></div>',
    margin: { top: '16mm', bottom: '16mm', left: '17mm', right: '17mm' } });
  await browser.close();
  console.log('ok', out);
})();
