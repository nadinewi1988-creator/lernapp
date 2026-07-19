import { useEffect, useRef, useState } from 'react';

// Spracheingabe über die browsereigene Web Speech API.
// Ist die API nicht verfügbar (z.B. Firefox), wird der Button
// GAR NICHT gerendert (Projektanweisung), statt kaputt zu wirken.

// Minimales Typing für die nicht-standardisierte API.
type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
};

function getRecognition(): SR | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SR;
    webkitSpeechRecognition?: new () => SR;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function MicButton({ onText }: { onText: (t: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SR | null>(null);

  useEffect(() => {
    setSupported(getRecognition() !== null);
  }, []);

  if (!supported) return null;

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = getRecognition();
    if (!rec) return;
    rec.lang = 'de-DE';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      onText(t + ' ');
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  return (
    <button
      type="button"
      className={`mic ${listening ? 'rec' : ''}`}
      onClick={toggle}
      title="Antwort einsprechen"
    >
      🎤
    </button>
  );
}
