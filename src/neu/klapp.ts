import { useState } from 'react';

/**
 * Auf-/Zuklapp-Zustand: standardmäßig alles zu. Was Nadine auf- oder zuklappt,
 * bleibt so, solange die App offen ist (auch beim Wechseln zwischen Seiten) –
 * gespeichert in sessionStorage, nach dem Schließen der App wieder alles zu.
 */
export function useKlapp<T>(name: string, start: T): [T, (v: T) => void] {
  const [wert, setWert] = useState<T>(() => { try { const v = sessionStorage.getItem('klapp-' + name); return v ? (JSON.parse(v) as T) : start; } catch { return start; } });
  const setzen = (v: T) => { setWert(v); try { sessionStorage.setItem('klapp-' + name, JSON.stringify(v)); } catch { /* egal */ } };
  return [wert, setzen];
}
