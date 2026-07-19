import { useState, useEffect } from 'react';
import { supabase, syncEnabled } from '../supabase';
import type { User } from '@supabase/supabase-js';

// Login per Google (ein Klick) ODER Magic-Link per E-Mail.
// Reicht für den Studien-Alltag und braucht kein Passwort-Handling.

export function useUser(): User | null {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    if (!syncEnabled) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return user;
}

export function AuthBar({ user }: { user: User | null }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  if (!syncEnabled) {
    return (
      <div className="authbar muted">
        Sync aus (keine Supabase-Konfiguration) – Fortschritt bleibt lokal.
      </div>
    );
  }

  if (user) {
    return (
      <div className="authbar">
        <span className="muted">Angemeldet: {user.email}</span>
        <button className="btn ghost sm" onClick={() => supabase.auth.signOut()}>
          Abmelden
        </button>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="authbar muted">
        Link gesendet – bitte E-Mail-Postfach prüfen und darauf klicken.
      </div>
    );
  }

  return (
    <div className="authbar">
      <button
        className="btn primary sm"
        onClick={async () => {
          await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin },
          });
        }}
      >
        Mit Google anmelden
      </button>
      <span className="muted" style={{ margin: '0 4px' }}>oder</span>
      <input
        className="input sm"
        type="email"
        placeholder="deine@uni-mail.de"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button
        className="btn ghost sm"
        onClick={async () => {
          if (!email) return;
          await supabase.auth.signInWithOtp({ email });
          setSent(true);
        }}
      >
        Anmeldelink senden
      </button>
    </div>
  );
}
