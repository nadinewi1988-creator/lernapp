// Lerninhalte aus dem Repo-Ordner content/ (aus den Modul-Chats, Schema: claude/lerninhalte_schema.md im Projekt).
// Vite bündelt alle JSON-Dateien beim Build; neue Dateien erscheinen mit dem nächsten Deploy.

export interface LZiel { text: string; art: string; quelle?: string; fragen: string[]; erklaerung_abschnitt?: string }
export interface LAbschnitt { titel: string; text: string; beispiel?: string; folien?: string }
export interface LDef { begriff: string; wortlaut: string; erklaerung: string; folie?: string }
export interface LAufgabe { id: string; art: string; text: string; quelle: string; loesung: string; loesungsweg: string; frist?: string;
  /** Hausaufgaben: Zielsitzung als „<teilmodul>_<JJJJ-MM-TT>“, verknüpfter Kalendereintrag (id aus Supabase) und PDF unter public/ (z. B. /dateien/pkb003/…pdf) */
  fuer_sitzung?: string; kalender_id?: string; pdf?: string; titel?: string }
export interface LFrage {
  id: string; baustein: string; format: 'frage' | 'mc' | 'luecke' | 'zuordnung' | 'offen'; niveau: string; schwierigkeit: number;
  frage?: string; antwort?: string; optionen?: string[]; richtig?: number[]; text?: string;
  kategorien?: string[]; elemente?: { text: string; kategorie: string }[];
  musterloesung?: string; bewertungspunkte?: string[]; punkte?: number;
  erklaerung: string; folie?: string; pruefungsrelevant?: boolean;
}
export interface LSitzung {
  schema: string; modul: string; teilmodul: string; datum: string; sitzung_nr: number; sitzung_id: string; thema: string; stand: string;
  quellen: { datei: string; art: string; seiten: string }[];
  lernziele: LZiel[]; kurzfassung: string[]; erklaerung: LAbschnitt[]; definitionen: LDef[]; aufgaben: LAufgabe[]; fragen: LFrage[];
  pruefungshinweise: string[]; offene_fragen: string[];
  datei: string; // Dateiname ohne .json, für die Fragen-IDs
}
export interface LGlossar { modul: string; eintraege: { begriff: string; wortlaut: string; erklaerung: string; quelle: string }[] }
export interface LSymbol { zeichen: string; latex: string; bedeutung: string; gelesen: string; module: string[]; erste_quelle: string }

const DATEIEN = import.meta.glob('/content/**/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

const SITZUNGEN: LSitzung[] = [];
const GLOSSARE: Record<string, LGlossar> = {};
let SYMBOLE: LSymbol[] = [];
/** Literatur aus der Modulbeschreibung, die in Nadines Modulordner liegt (Feld `literatur` in _modul.json, gepflegt von den Modul-Chats) */
export interface LLiteratur { eintrag: string; vorhanden: boolean; datei?: string; hinweis?: string; stand?: string }
const LITERATUR: Record<string, LLiteratur[]> = {};
for (const [pfad, inhalt] of Object.entries(DATEIEN)) {
  const name = pfad.split('/').pop()!.replace(/\.json$/, '');
  const d = inhalt as { schema?: string };
  if (d.schema === 'lernapp-sitzung/2') SITZUNGEN.push({ ...(inhalt as LSitzung), datei: name });
  else if (d.schema === 'lernapp-glossar/2') { const g = inhalt as LGlossar; GLOSSARE[g.modul] = g; }
  else if (d.schema === 'lernapp-symbole/2') SYMBOLE = (inhalt as { symbole: LSymbol[] }).symbole;
  else if (d.schema === 'lernapp-modul/2') { const m = inhalt as { modul: string; literatur?: LLiteratur[] }; if (m.literatur) LITERATUR[m.modul] = m.literatur; }
}

/** Inhalt zu einer Sitzung: zuerst über die feste Sitzungs-ID, sonst über Teilmodul + Datum. */
export function inhaltZu(sid: string, teil: string, datum: string): LSitzung | null {
  return SITZUNGEN.find((s) => s.sitzung_id && s.sitzung_id === sid) ?? SITZUNGEN.find((s) => s.teilmodul === teil && s.datum === datum) ?? null;
}
/** Alle Sitzungsdateien (z. B. für Hausaufgaben-Verknüpfungen). */
export const alleSitzungen = () => SITZUNGEN;
export const sitzungenVon = (modul: string) => SITZUNGEN.filter((s) => s.modul === modul).sort((a, b) => (a.datum + a.teilmodul).localeCompare(b.datum + b.teilmodul));
export const glossarVon = (modul: string) => GLOSSARE[modul]?.eintraege ?? [];
export const symboleVon = (modul: string) => SYMBOLE.filter((s) => s.module.includes(modul));
export const frageRef = (s: LSitzung, f: LFrage) => 'lf:' + s.datei + '#' + f.id;

// ---------- Mini-Markdown (fett, kursiv, Tabellen, Zeilenumbrüche) ----------
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (t: string) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<i>$2</i>');
export function mdHtml(text: string): string {
  return (text || '').split(/\n{2,}/).map((block) => {
    const zeilen = block.split('\n');
    if (zeilen.every((z) => z.trim().startsWith('|'))) {
      const rows = zeilen.filter((z) => !/^\s*\|[\s|:-]+\|\s*$/.test(z)).map((z) => z.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      const [kopf, ...rest] = rows;
      return '<table class="lt-tab"><thead><tr>' + kopf.map((c) => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>' + rest.map((r) => '<tr>' + r.map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
    }
    return '<p>' + zeilen.map(inline).join('<br>') + '</p>';
  }).join('');
}

const normLit = (t: string) => t.toLowerCase().replace(/[„“"'.,:;()\-–]/g, ' ').replace(/\s+/g, ' ').trim();
/** Abgleich je Literaturangabe der Modulbeschreibung: null = noch nicht abgeglichen */
export function literaturStatus(modul: string, eintrag: string): LLiteratur | null {
  const l = LITERATUR[modul]; if (!l) return null;
  const n = normLit(eintrag);
  return l.find((x) => normLit(x.eintrag) === n) ?? l.find((x) => n.startsWith(normLit(x.eintrag)) || normLit(x.eintrag).startsWith(n)) ?? null;
}
export const literaturStand = (modul: string) => (LITERATUR[modul] ?? []).map((x) => x.stand ?? '').sort().pop() ?? '';
export const literaturAbgeglichen = (modul: string) => !!LITERATUR[modul];
