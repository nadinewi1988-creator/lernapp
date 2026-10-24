import { useState } from 'react';
import type { Studienstand, Termin, Versuch } from '../db';
import { speichereVersuch, entferneVersuch, speichereTermin, setzeVoraussetzung, verschiebePruefung, neuePruefung, setzeBafoegGrenze } from '../db';
import { auswerten, STATUS_FARBE, BEREICH_ZIEL, fristHinweis, mitTag, datumLang, noteText, tageBis, heuteIso, type Eintrag } from '../pruefungslogik';
import { farbe, REGELN, DOKUMENTE } from '../data/studienverlauf';

const NOTEN = ['1,0', '1,3', '1,7', '2,0', '2,3', '2,7', '3,0', '3,3', '3,7', '4,0', '5,0'];
const HRS_GRUND: Record<string, string> = { mab012: 'Wahlpflicht-Empfehlung für Haupt- und Realschule', asp001: 'Schulpraktikum für die Lehramtsoption', opb001: 'Orientierungspraktikum für die Lehramtsoption' };

interface Props { stand: Studienstand; unter: string; gehe: (u: string) => void; neuLaden: () => Promise<void> }

export function Pruefungen({ stand, unter, gehe, neuLaden }: Props) {
  const a = auswerten(stand);
  const tab = unter || 'meine';
  const [offen, setOffen] = useState<Record<string, boolean>>({});
  const [noteD, setNoteD] = useState<null | { e: Eintrag; nr: number; wert: string; datum: string; id?: string }>(null);
  const [termD, setTermD] = useState<null | { e: Eintrag; felder: Record<string, Partial<Termin>> }>(null);
  const [verD, setVerD] = useState<null | { e: Eintrag; ziel: string; grund: string }>(null);
  const [neuD, setNeuD] = useState<null | { kuerzel: string; name: string; cp: string; form: string; semester_id: string; datum: string }>(null);
  const [fehler, setFehler] = useState('');
  const [arbeitet, setArbeitet] = useState(false);
  const istOffen = (id: string, akt: boolean) => (offen[id] === undefined ? akt : offen[id]);

  async function los(f: () => Promise<void>) {
    setArbeitet(true); setFehler('');
    try { await f(); await neuLaden(); setNoteD(null); setTermD(null); setVerD(null); setNeuD(null); }
    catch (e) { setFehler(String((e as Error).message || e)); }
    finally { setArbeitet(false); }
  }

  const grenze = stand.einstellungen?.bafoeg_grenze ?? 90;
  const puffer = a.bafoegMoeglich - grenze;
  const bafoeg = a.cpGesamt >= grenze ? { s: 'erreicht', bg: '#e3f2e8', fg: '#2f7a4b' } : puffer < 0 ? { s: 'gefährdet', bg: '#fde9e9', fg: '#c42b2b' } : puffer < 15 ? { s: 'knapp', bg: '#fdf1e2', fg: '#9a5b14' } : { s: 'auf Kurs', bg: '#e3f2e8', fg: '#2f7a4b' };
  const naechste = a.naechsteTermine[0];

  return (
    <>
      <header className="kopf">
        <div>
          <h1>Prüfungen</h1>
          <div className="unter">Bachelor Combined Studies · Mathematik + Politikwissenschaft · Lehramtsoption Haupt- und Realschule</div>
        </div>
        <button className="knopf gross" onClick={() => setNeuD({ kuerzel: '', name: '', cp: '', form: '', semester_id: a.akt?.id ?? '', datum: '' })}>+ Prüfung</button>
      </header>
      <div className="umschalter">
        {[['meine', 'Meine Prüfungen'], ['bafoeg', 'BAföG'], ['regeln', 'Regeln & Ordnungen']].map(([id, n]) => <button key={id} className={tab === id ? 'aktiv' : ''} onClick={() => gehe(id)}>{n}</button>)}
      </div>

      {tab === 'meine' && (
        <>
          {a.fristen.length > 0 && (
            <section className="karte" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.06em', color: 'var(--ink-3)' }}>NÄCHSTE FRISTEN</span><span className="klein-text">erscheinen automatisch auch im Dashboard</span></div>
              {a.fristen.slice(0, 5).map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <b style={{ color: farbe(f.kuerzel)[0], fontSize: 13, minWidth: 60 }}>{f.kuerzel}</b><span style={{ fontSize: 14 }}>{f.text}</span>
                  <span className="schild" style={{ background: f.tage <= 3 ? '#fde9e9' : '#eef0f3', color: f.tage <= 3 ? '#c42b2b' : '#4b5563' }}>{f.tage === 0 ? 'heute' : 'in ' + f.tage + (f.tage === 1 ? ' Tag' : ' Tagen')}</span>
                </div>
              ))}
            </section>
          )}
          {(bafoeg.s === 'knapp' || bafoeg.s === 'gefährdet') && (
            <button className="karte" onClick={() => gehe('bafoeg')} style={{ textAlign: 'left', background: bafoeg.bg, color: bafoeg.fg, fontWeight: 800, cursor: 'pointer' }}>BAföG-Check: {bafoeg.s} – {a.bafoegMoeglich} von {grenze} CP bis Ende 4. Semester möglich →</button>
          )}
          <div className="kacheln">
            <div className="karte"><div className="kachel-label">Bestanden</div><div className="kachel-wert">{a.bestanden.length} {a.bestanden.length === 1 ? 'Modul' : 'Module'}</div><div className="kachel-info">{a.cpGesamt} CP</div></div>
            <div className="karte"><div className="kachel-label">Notenschnitt</div><div className="kachel-wert">{a.noten.gesamt !== null ? noteText(a.noten.gesamt) : '–'}</div><div className="kachel-info">Mathe {a.noten.mathe !== null ? noteText(a.noten.mathe) : '–'} · Politik {a.noten.politik !== null ? noteText(a.noten.politik) : '–'} · Profil {a.noten.profil !== null ? noteText(a.noten.profil) : '–'}</div></div>
            <div className="karte"><div className="kachel-label">Dieses Semester</div><div className="kachel-wert">{a.aktListe.length} Prüfungen</div><div className="kachel-info">{naechste ? 'nächste am ' + datumLang(naechste) : 'keine offenen Termine'}</div></div>
            <div className="karte"><div className="kachel-label">Verschoben</div><div className="kachel-wert">{a.verschoben.length ? a.verschoben.length + (a.verschoben.length === 1 ? ' Modul' : ' Module') : 'Keine'}</div><div className="kachel-info">{a.verschoben.length ? a.verschoben.map((e) => e.modul.kuerzel).join(' · ') : 'alles nachgeholt'}</div></div>
          </div>
          <section className="karte" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}><b style={{ fontSize: 15 }}>Credit Points</b><span><b style={{ fontSize: 18 }}>{a.cpGesamt} von 180 CP</b> <span className="klein-text">· noch {180 - a.cpGesamt} offen</span></span></div>
            <div className="balken"><div style={{ width: Math.min(100, a.cpGesamt / 1.8) + '%', background: '#4f8f80' }} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
              {Object.keys(BEREICH_ZIEL).map((b) => <div key={b}><b style={{ fontSize: 14 }}>{b}</b><div className="klein-text">{a.cpBereich[b] ?? 0} / {BEREICH_ZIEL[b]}</div></div>)}
            </div>
          </section>

          {a.proSemester.map((ps) => {
            const auf = istOffen(ps.semester.id, ps.aktuell);
            const zus = zusammenfassung(ps.liste);
            return (
              <section key={ps.semester.id} className="karte" style={{ padding: 0, overflow: 'hidden' }}>
                <button onClick={() => setOffen({ ...offen, [ps.semester.id]: !auf })} aria-expanded={auf} style={{ width: '100%', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, minHeight: 60, padding: '12px 20px', border: 0, background: '#fff', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ width: 14, color: 'var(--ink-3)' }}>{auf ? '▾' : '▸'}</span>
                  <b style={{ fontSize: 17 }}>{ps.semester.fachsemester}. Semester</b>
                  <span className="klein-text">{ps.semester.bezeichnung}</span>
                  <span className="schild" style={{ background: 'var(--line-2)', color: ps.cpIst >= ps.cpSoll && ps.cpSoll ? '#2f7a4b' : 'var(--ink-2)' }}>{ps.cpIst} von {ps.cpSoll} CP</span>
                  <span className="klein-text" style={{ marginLeft: 'auto', fontWeight: 700 }}>{ps.aktuell ? 'aktuell · ' : ''}{zus}</span>
                </button>
                {auf && (
                  <div style={{ padding: '0 20px 12px' }}>
                    {ps.liste.map((e) => (
                      <Zeile key={e.pruefung.id + (e.imUrsprung ? 'u' : '')} e={e} aktuell={ps.aktuell} stand={stand}
                        note={(v) => setNoteD(v ? { e, nr: v.nr, wert: v.unbenotet ? 'unbenotet' : noteText(v.note ?? 1), datum: v.datum ?? '', id: v.id } : { e, nr: e.versuche.length + 1, wert: e.modul.kuerzel === 'opb001' || e.modul.kuerzel === 'pbb133' ? 'unbenotet' : '1,0', datum: e.naechster?.termin?.datum && e.naechster.termin.datum <= heuteIso() ? e.naechster.termin.datum : '' })}
                        termine={() => setTermD({ e, felder: Object.fromEntries((e.termine.length ? e.termine : [{ art: 'Ersttermin' } as Termin]).map((t) => [t.art, { ...t }])) })}
                        verschieben={() => setVerD({ e, ziel: stand.semester.find((s) => s.fachsemester === (a.akt?.fachsemester ?? 3) + 1)?.id ?? '', grund: '' })}
                        haken={(id, v) => los(() => setzeVoraussetzung(id, v))} />
                    ))}
                    {ps.liste.length === 0 && <div className="klein-text" style={{ padding: '12px 0' }}>Keine Prüfungen in diesem Semester.</div>}
                  </div>
                )}
              </section>
            );
          })}
        </>
      )}

      {tab === 'bafoeg' && (
        <section className="karte" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <div><b style={{ fontSize: 17 }}>BAföG-Check</b><div className="klein-text">Leistungsnachweis (Formblatt 5) zu Beginn des 5. Fachsemesters · WiSe 27/28</div></div>
            <span className="schild" style={{ background: bafoeg.bg, color: bafoeg.fg, fontSize: 14, padding: '6px 12px' }}>{bafoeg.s}</span>
          </div>
          <label className="feld" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>Grenze laut Prüfungsamt
            <input type="number" min={0} max={180} defaultValue={grenze} style={{ width: 80 }} onBlur={(ev) => { const g = parseInt(ev.target.value, 10); if (g >= 0 && g !== grenze) los(() => setzeBafoegGrenze(g)); }} /> CP
          </label>
          <div style={{ position: 'relative', height: 14, borderRadius: 999, background: 'var(--line-2)' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: Math.min(100, a.bafoegMoeglich / 1.8) + '%', borderRadius: 999, background: '#cfe6dd' }} />
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: Math.min(100, a.cpGesamt / 1.8) + '%', borderRadius: 999, background: '#4f8f80' }} />
            <div style={{ position: 'absolute', top: -5, bottom: -5, left: Math.min(100, grenze / 1.8) + '%', width: 3, borderRadius: 2, background: 'var(--ink)' }} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13 }}>
            <span>erreicht <b>{a.cpGesamt} CP</b></span><span>bis Ende 4. Semester möglich <b>{a.bafoegMoeglich} CP</b></span><span>Grenze <b>{grenze} CP</b></span>
          </div>
          <div className="klein-text" style={{ lineHeight: 1.45 }}>„Möglich“ zählt alle noch offenen Prüfungen bis einschließlich 4. Semester mit. Die Grenze bitte beim Akademischen Prüfungsamt bestätigen lassen. Mit einem Kind unter 14 Jahren kann die Vorlage auf Antrag verschoben werden (§ 15 Abs. 3 BAföG).</div>
        </section>
      )}

      {tab === 'regeln' && <RegelnSeite />}

      {/* ---------- Dialoge ---------- */}
      {noteD && (
        <Dialog titel="Note eintragen" unter={noteD.e.modul.kuerzel + ' · ' + noteD.e.modul.name} zu={() => setNoteD(null)}>
          <label className="feld">Versuch<select value={noteD.nr} onChange={(ev) => setNoteD({ ...noteD, nr: +ev.target.value })}><option value={1}>1. Versuch</option><option value={2}>2. Versuch (1. Wiederholung)</option><option value={3}>3. Versuch (2. Wiederholung)</option></select></label>
          <label className="feld">Note<select value={noteD.wert} onChange={(ev) => setNoteD({ ...noteD, wert: ev.target.value })}>{NOTEN.map((n) => <option key={n} value={n}>{n === '5,0' ? '5,0 – nicht bestanden' : n}</option>)}<option value="unbenotet">unbenotet – bestanden</option></select></label>
          <label className="feld">Datum der Prüfung<input type="date" value={noteD.datum} onChange={(ev) => setNoteD({ ...noteD, datum: ev.target.value })} /></label>
          <div className="klein-text">Bei 5,0 wird der Versuch als „nicht bestanden“ gespeichert und du kannst den nächsten Versuch eintragen. „Unbenotet“ zählt für die CP, aber nicht für den Schnitt – genau wie Fehlversuche.</div>
          {fehler && <div className="fehler">{fehler}</div>}
          <div className="dialog-knoepfe">
            {noteD.id && <button className="knopf rot" style={{ marginRight: 'auto' }} disabled={arbeitet} onClick={() => los(() => entferneVersuch(noteD.id!))}>Eintrag entfernen</button>}
            <button className="knopf" onClick={() => setNoteD(null)}>Abbrechen</button>
            <button className="knopf" style={{ fontWeight: 800 }} disabled={arbeitet} onClick={() => los(() => speichereVersuch({ pruefung_id: noteD.e.pruefung.id, nr: noteD.nr, note: noteD.wert === 'unbenotet' ? null : parseFloat(noteD.wert.replace(',', '.')), unbenotet: noteD.wert === 'unbenotet', datum: noteD.datum || null }))}>Speichern</button>
          </div>
        </Dialog>
      )}
      {termD && (
        <Dialog titel="Termine bearbeiten" unter={termD.e.modul.kuerzel + ' · ' + termD.e.modul.name} zu={() => setTermD(null)}>
          {Object.keys(termD.felder).map((art) => {
            const f = termD.felder[art];
            const setz = (k: keyof Termin, v: string) => setTermD({ ...termD, felder: { ...termD.felder, [art]: { ...f, [k]: v || null } } });
            return (
              <div key={art} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 12, background: 'var(--paper)' }}>
                <b>{art}</b>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                  <label className="feld">Prüfungstag<input type="date" value={f.datum ?? ''} onChange={(ev) => setz('datum', ev.target.value)} /></label>
                  <label className="feld">Uhrzeit<input value={f.zeit ?? ''} onChange={(ev) => setz('zeit', ev.target.value)} placeholder="z. B. 8–10 Uhr" /></label>
                  <label className="feld">Anmeldung ab<input type="date" value={f.anmeldung_ab ?? ''} onChange={(ev) => setz('anmeldung_ab', ev.target.value)} /></label>
                  <label className="feld">Anmeldung bis<input type="date" value={f.anmeldung_bis ?? ''} onChange={(ev) => setz('anmeldung_bis', ev.target.value)} /></label>
                  <label className="feld">Abmeldung / Rücktritt bis<input type="date" value={f.abmeldung_bis ?? ''} onChange={(ev) => setz('abmeldung_bis', ev.target.value)} /></label>
                </div>
              </div>
            );
          })}
          {!termD.felder['Zweittermin'] && termD.e.modul.bereich !== 'BA-Arbeit' && <button className="link-knopf" style={{ alignSelf: 'flex-start' }} onClick={() => setTermD({ ...termD, felder: { ...termD.felder, Zweittermin: { art: 'Zweittermin' } } })}>+ Zweittermin</button>}
          <div className="klein-text">Leere Felder gelten als „noch offen“. Erinnerungen und Fristen-Schilder passen sich automatisch an. Prüfungstermine pflegst du nur hier – Kalender und Dashboard übernehmen sie. Der Stud.IP-Wochencheck überschreibt deine Änderungen nur bei neuer Info der Uni und meldet das.</div>
          {fehler && <div className="fehler">{fehler}</div>}
          <div className="dialog-knoepfe">
            <button className="knopf" onClick={() => setTermD(null)}>Abbrechen</button>
            <button className="knopf" style={{ fontWeight: 800 }} disabled={arbeitet} onClick={() => los(async () => { for (const f of Object.values(termD.felder)) await speichereTermin({ id: f.id, pruefung_id: termD.e.pruefung.id, art: f.art!, datum: f.datum ?? null, zeit: f.zeit ?? null, anmeldung_ab: f.anmeldung_ab ?? null, anmeldung_bis: f.anmeldung_bis ?? null, abmeldung_bis: f.abmeldung_bis ?? null }); })}>Speichern</button>
          </div>
        </Dialog>
      )}
      {verD && (
        <Dialog titel="Prüfung verschieben" unter={verD.e.modul.kuerzel + ' · ' + verD.e.modul.name} zu={() => setVerD(null)}>
          <label className="feld">In welches Semester?<select value={verD.ziel} onChange={(ev) => setVerD({ ...verD, ziel: ev.target.value })}>{stand.semester.filter((s) => s.fachsemester > (a.akt?.fachsemester ?? 0)).map((s) => <option key={s.id} value={s.id}>{s.fachsemester}. Semester · {s.bezeichnung}</option>)}</select></label>
          <label className="feld">Grund (optional)<input value={verD.grund} onChange={(ev) => setVerD({ ...verD, grund: ev.target.value })} /></label>
          {(() => { const ab = verD.e.termine.find((t) => t.abmeldung_bis)?.abmeldung_bis; return <div className="klein-text"><b>Abmeldung nicht vergessen:</b> {ab ? 'bis ' + datumLang(ab) : 'Frist noch offen (sonst spätestens 3 Tage vor der Prüfung)'}. Die Prüfung bleibt im {a.akt?.fachsemester}. Semester als „Verschoben“ sichtbar und erscheint im gewählten Semester als geplant.</div>; })()}
          {fehler && <div className="fehler">{fehler}</div>}
          <div className="dialog-knoepfe"><button className="knopf" onClick={() => setVerD(null)}>Abbrechen</button><button className="knopf" style={{ fontWeight: 800 }} disabled={arbeitet || !verD.ziel} onClick={() => los(() => verschiebePruefung(verD.e.pruefung.id, verD.e.modul.id, verD.ziel, verD.grund))}>Verschieben</button></div>
        </Dialog>
      )}
      {neuD && (
        <Dialog titel="Prüfung hinzufügen" zu={() => setNeuD(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
            <label className="feld">Kürzel<input value={neuD.kuerzel} onChange={(ev) => setNeuD({ ...neuD, kuerzel: ev.target.value.trim().toLowerCase() })} placeholder="mab006" /></label>
            <label className="feld">Genaue Modulbezeichnung<input value={neuD.name} onChange={(ev) => setNeuD({ ...neuD, name: ev.target.value })} /></label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            <label className="feld">Semester<select value={neuD.semester_id} onChange={(ev) => setNeuD({ ...neuD, semester_id: ev.target.value })}>{stand.semester.map((s) => <option key={s.id} value={s.id}>{s.fachsemester}. Semester</option>)}</select></label>
            <label className="feld">CP<input type="number" min={0} value={neuD.cp} onChange={(ev) => setNeuD({ ...neuD, cp: ev.target.value })} /></label>
            <label className="feld">Prüfungsform<input value={neuD.form} onChange={(ev) => setNeuD({ ...neuD, form: ev.target.value })} placeholder="Klausur" /></label>
          </div>
          <label className="feld">Prüfungstag (falls bekannt)<input type="date" value={neuD.datum} onChange={(ev) => setNeuD({ ...neuD, datum: ev.target.value })} /></label>
          <div className="klein-text">Anmelde- und Abmeldefristen trägst du danach über „Termine bearbeiten“ ein. Die Prüfung wird automatisch nach Mathe → Politik → Rest einsortiert.</div>
          {fehler && <div className="fehler">{fehler}</div>}
          <div className="dialog-knoepfe"><button className="knopf" onClick={() => setNeuD(null)}>Abbrechen</button><button className="knopf" style={{ fontWeight: 800 }} disabled={arbeitet || !neuD.kuerzel || !neuD.name} onClick={() => los(() => neuePruefung(stand.studiengangId, { kuerzel: neuD.kuerzel, name: neuD.name, cp: parseInt(neuD.cp, 10) || 0, form: neuD.form, semester_id: neuD.semester_id, datum: neuD.datum || null }))}>Speichern</button></div>
        </Dialog>
      )}
    </>
  );
}

function zusammenfassung(liste: Eintrag[]) {
  const z: Record<string, number> = {};
  liste.forEach((e) => { z[e.status] = (z[e.status] ?? 0) + 1; });
  return Object.entries(z).map(([s, n]) => n + ' ' + s.toLowerCase()).join(' · ');
}

function Zeile({ e, aktuell, note, termine, verschieben, haken, stand }: { e: Eintrag; aktuell: boolean; stand: Studienstand; note: (v?: Versuch) => void; termine: () => void; verschieben: () => void; haken: (id: string, v: boolean) => void }) {
  const [fg, bg] = farbe(e.modul.kuerzel);
  const [sbg, sfg] = STATUS_FARBE[e.status];
  const vor = stand.voraussetzungen.filter((v) => v.pruefung_id === e.pruefung.id);
  const zielSem = stand.semester.find((s) => s.id === e.pruefung.verschoben_nach_semester_id);
  const urSem = stand.semester.find((s) => s.id === e.pruefung.semester_id);
  const details = [e.pruefung.form, e.imUrsprung && zielSem ? 'verschoben → ' + zielSem.fachsemester + '. Semester' : '', !e.imUrsprung && zielSem && urSem ? 'aus dem ' + urSem.fachsemester + '. Semester' + (e.pruefung.verschoben_grund ? ' · Grund: ' + e.pruefung.verschoben_grund : '') : '', e.modul.hinweis ?? '', e.modul.cp + ' CP'].filter(Boolean).join(' · ');
  const letzterTermin = e.termine.filter((t) => t.datum && t.datum < heuteIso()).sort((a, b) => b.datum!.localeCompare(a.datum!))[0];
  const geschriebenVor = !e.imUrsprung && !e.bestanden && letzterTermin && !e.versuche.some((v) => v.datum && v.datum >= letzterTermin.datum!) ? -tageBis(letzterTermin.datum!) : null;
  const kannNote = !e.imUrsprung && !e.bestanden && e.status !== 'Endgültig nicht bestanden' && e.status !== 'Verschoben' && (e.status !== 'Geplant' || !!letzterTermin);
  const zeigTermine = aktuell && !e.imUrsprung && !e.bestanden;
  const knopf = { minHeight: 36, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 10, background: '#fff', fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', cursor: 'pointer' } as const;
  return (
    <div className="pr-zeile" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '14px 0', borderTop: '1px solid var(--line-2)' }}>
      <a href={'#/module/' + e.modul.kuerzel} title="Modul öffnen" style={{ flex: '0 0 72px', padding: '4px 0', borderRadius: 10, textAlign: 'center', fontWeight: 800, fontSize: 13, background: bg, color: fg, textDecoration: 'none' }}>{e.modul.kuerzel}</a>
      <div className="pr-text" style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{e.modul.name}</div>
        <div className="klein-text">{details}</div>
        {vor.length > 0 && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-2)' }}>
            {vor.map((v) => <label key={v.id} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={v.erledigt} onChange={(ev) => haken(v.id, ev.target.checked)} style={{ width: 18, height: 18, margin: 0, accentColor: '#4f8f80' }} />{v.text}</label>)}
          </div>
        )}
        {e.versuche.length > 0 && (
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}>
            {e.versuche.map((v) => <div key={v.id}><b>{v.nr}. Versuch</b>{v.datum ? ' · ' + datumLang(v.datum) : ''} · <button className="link-knopf" onClick={() => note(v)} title="Ändern" style={{ textDecoration: 'none', fontSize: 13, color: v.unbenotet || (v.note ?? 5) <= 4 ? '#2f7a4b' : '#c42b2b' }}>{v.unbenotet ? 'bestanden (unbenotet)' : noteText(v.note ?? 0)}</button></div>)}
          </div>
        )}
        {zeigTermine && (
          <div style={{ marginTop: 8, background: 'var(--paper)', borderRadius: 12, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            <div className="pr-termin-kopf" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', color: 'var(--ink-3)' }}>
              <span>TERMIN</span><span>ANMELDUNG</span><span>ABMELDUNG / RÜCKTRITT</span>
            </div>
            {e.termine.map((t) => {
              const h = fristHinweis(t);
              const an = t.anmeldung_ab && t.anmeldung_bis ? datumLang(t.anmeldung_ab) + '–' + datumLang(t.anmeldung_bis) : t.anmeldung_ab ? 'ab ' + datumLang(t.anmeldung_ab) + ' (Ende noch offen)' : t.anmeldung_bis ? 'bis ' + datumLang(t.anmeldung_bis) : 'noch offen';
              const ab = t.abmeldung_bis ? 'bis ' + datumLang(t.abmeldung_bis) : 'noch offen';
              return (
                <div key={t.id} className="pr-termin" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, padding: '6px 0', borderTop: '1px solid #ecece6' }}>
                  <span><b>{t.art}</b><br />{t.datum ? mitTag(t.datum) : 'noch offen'}</span>
                  <span style={{ color: an.includes('offen') ? '#9a5b14' : undefined, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                    <span><span className="pr-mobil">Anmeldung: </span>{an}</span>
                    {h && <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 800, background: h.bg, color: h.fg }}>{h.text}</span>}
                  </span>
                  <span style={{ color: ab === 'noch offen' ? '#9a5b14' : undefined }}><span className="pr-mobil">Abmeldung: </span>{ab}</span>
                </div>
              );
            })}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingTop: 6, borderTop: '1px solid #ecece6', fontSize: 12, color: 'var(--ink-3)' }}>
              <span>{e.termine.some((t) => t.quelle === 'nadine') ? 'von dir geändert' : 'aus Stud.IP/QISPOS'}{e.termine[0] ? ' · Stand ' + datumLang(e.termine[0].stand.slice(0, 10)) : ''}</span>
              <button type="button" onClick={termine} style={{ ...knopf, minHeight: 32, padding: '0 10px', borderRadius: 8, fontSize: 12 }}>Termine bearbeiten</button>
            </div>
          </div>
        )}
      </div>
      <span className="pr-schilder" style={{ flex: '0 0 140px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
        <span className="schild" style={{ background: sbg, color: sfg }}>{e.status}</span>
        {e.modul.lehramt_hrs && <span className="schild" title={HRS_GRUND[e.modul.kuerzel] ?? 'Empfohlen für den Zugang zum M.Ed. Haupt- und Realschule'} style={{ background: '#fff6d6', color: '#7a5a00' }}>Lehramt HRS</span>}
        {geschriebenVor !== null && geschriebenVor > 0 && <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700, lineHeight: 1.3, background: '#f0f0eb', color: 'var(--ink-2)' }}>geschrieben vor {geschriebenVor} {geschriebenVor === 1 ? 'Tag' : 'Tagen'} – Note fehlt</span>}
      </span>
      <span className="pr-knoepfe" style={{ flex: '0 1 260px', display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
        {zeigTermine && e.status === 'Geplant' && <button type="button" style={knopf} onClick={verschieben}>Verschieben</button>}
        {kannNote && <button type="button" style={{ ...knopf, border: '1px dashed #c9ccd1' }} onClick={() => note()}>Note eintragen</button>}
        {e.bestanden && <button type="button" onClick={() => note()} title="Versuch hinzufügen oder ändern" style={{ ...knopf, border: 0, background: 'transparent', fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{e.unbenotet ? 'bestanden' : e.note !== null ? noteText(e.note) : ''}</button>}
      </span>
    </div>
  );
}

function Dialog({ titel, unter, zu, children }: { titel: string; unter?: string; zu: () => void; children: React.ReactNode }) {
  return (
    <div className="dialog-hg" onClick={(e) => { if (e.target === e.currentTarget) zu(); }}>
      <div className="dialog" role="dialog" aria-label={titel}>
        <h2>{titel}</h2>
        {unter && <div className="klein-text" style={{ marginTop: -6 }}>{unter}</div>}
        {children}
      </div>
    </div>
  );
}

function RegelnSeite() {
  const [offen, setOffen] = useState(true);
  return (
    <>
      <section className="karte" style={{ padding: 0, borderRadius: 20, overflow: 'hidden' }}>
        <button type="button" onClick={() => setOffen(!offen)} style={{ width: '100%', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', minHeight: 60, padding: '10px 20px', border: 0, background: '#fff', cursor: 'pointer', textAlign: 'left' }}>
          <span style={{ fontSize: 14, color: 'var(--ink-3)', width: 14 }}>{offen ? '▾' : '▸'}</span>
          <span style={{ fontSize: 17, fontWeight: 800 }}>Regeln auf einen Blick</span>
          <span className="klein-text">Rahmenprüfungsordnung 14/2026 + Prüfungsordnung BACS 15/2024</span>
        </button>
        {offen && (
          <div style={{ padding: '0 20px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 12 }}>
            {REGELN.map((r) => (
              <div key={r.titel} style={{ background: 'var(--paper)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{r.titel}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45 }}>{r.text}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700 }}>{r.quelle}</div>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="karte" style={{ borderRadius: 20, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Ordnungen &amp; Studienverlaufspläne</h2>
        <div className="klein-text">Die Modulbeschreibungen liegen jeweils im Modul selbst. ewb001, ewb002, ewb013 und pyb005 gehören zum Profilierungsbereich.</div>
        {DOKUMENTE.map((d) => (
          <a key={d.url} href={d.url} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, padding: '8px 14px', borderRadius: 12, background: 'var(--paper)', textDecoration: 'none' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b6f76" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" /><path d="M14 3v6h6" /></svg>
            <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{d.titel}</span>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{d.info}</span>
          </a>
        ))}
      </section>
    </>
  );
}
