// ============================================================
//  Konverter: alte <modul>_app.html  ->  Modul-JSON (neues Schema)
//
//  Nutzung:
//    node scripts/convert-html.mjs pfad/zur/mab002_app.html vorlesung
//
//  Zieht FLASHCARDS, QUIZ, SESSIONS aus der HTML und schreibt eine
//  JSON-Datei nach src/data/. Karten-IDs werden – falls vorhanden –
//  übernommen, sonst stabil aus (Sitzung + Frage) gehasht.
// ============================================================
import { readFileSync, writeFileSync } from 'fs';
import { basename } from 'path';

function stableId(session, q){
  const input = session + '::' + q;
  let h = 0x811c9dc5;
  for(let i=0;i<input.length;i++){ h ^= input.charCodeAt(i); h = Math.imul(h,0x01000193); }
  return 'c' + (h>>>0).toString(36);
}

function extractArray(html, name){
  const marker = `const ${name} = [`;
  const start = html.indexOf(marker);
  if(start === -1) return null;
  let i = start + marker.length - 1, depth=0, inStr=false, strCh='', esc=false;
  for(; i<html.length; i++){
    const c = html[i];
    if(inStr){ if(esc){esc=false;continue;} if(c==='\\'){esc=true;continue;} if(c===strCh) inStr=false; continue; }
    if(c==='"'||c==="'"){ inStr=true; strCh=c; continue; }
    if(c==='[') depth++;
    else if(c===']'){ depth--; if(depth===0){ i++; break; } }
  }
  return JSON.parse(html.slice(start+marker.length-1, i));
}

const [file, trackId='vorlesung'] = process.argv.slice(2);
if(!file){ console.error('Usage: node scripts/convert-html.mjs <html> [trackId]'); process.exit(1); }

const html = readFileSync(file, 'utf8');
const FLASHCARDS = extractArray(html, 'FLASHCARDS') || [];
const QUIZ = extractArray(html, 'QUIZ') || [];
const SESSIONS = extractArray(html, 'SESSIONS') || [];

const moduleId = basename(file).replace(/[_-].*$/, '') || 'modul';

const flashcards = FLASHCARDS.map(c => ({
  id: c.id || stableId(c.session, c.q),
  session: c.session, q: c.q, a: c.a,
  hint: c.hint,
  herkunft: c.selfMade ? 'selbst' : 'direkt',
  flagged: !!c.flagged,
}));

const quiz = QUIZ.map(q => ({
  id: stableId(q.session, q.q),
  session: q.session, q: q.q, options: q.options,
  correct: q.correct, expl: q.expl, flagged: !!q.flagged,
}));

const out = {
  id: moduleId, name: moduleId,
  tracks: [{ id: trackId, label: trackId==='seminar'?'Seminare':'Vorlesung',
    sessions: SESSIONS, flashcards, quiz, exam: [], examDurationMin: 90 }],
};

const target = `src/data/${moduleId}.json`;
writeFileSync(target, JSON.stringify(out, null, 2));
console.log(`OK -> ${target}  (${flashcards.length} Karten, ${quiz.length} Quiz, ${SESSIONS.length} Sitzungen)`);
