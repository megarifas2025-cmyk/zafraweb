import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { supabase, supabaseConfigured } from './lib/supabase';

type PingState = 'idle' | 'loading' | 'ok' | 'error';

export default function App() {
  const [ping, setPing] = useState<PingState>('idle');
  const [pingMsg, setPingMsg] = useState('');

  useEffect(() => {
    if (!supabaseConfigured) {
      setPing('error');
      setPingMsg('Faltan variables de entorno en el build.');
      return;
    }
    setPing('loading');
    void (async () => {
      const { error } = await supabase.auth.getSession();
      if (error) {
        setPing('error');
        setPingMsg(error.message);
        return;
      }
      setPing('ok');
      setPingMsg('Cliente Supabase listo (puedes iniciar sesión cuando agreguemos el formulario).');
    })();
  }, []);

  return (
    <div style={styles.page}>
      <header style={styles.hero}>
        <h1 style={styles.title}>ZafraClic</h1>
        <p style={styles.subtitle}>
          Portal web — misma base que la app móvil (Supabase).
        </p>
      </header>

      <section style={styles.card}>
        <h2 style={styles.h2}>Estado del backend</h2>
        {!supabaseConfigured && (
          <p style={styles.warn}>
            Configura <code style={styles.code}>VITE_SUPABASE_URL</code> y{' '}
            <code style={styles.code}>VITE_SUPABASE_ANON_KEY</code> en Cloudflare Pages → Settings →
            Environment variables (o en <code style={styles.code}>web/.env</code> en local).
          </p>
        )}
        {ping === 'loading' && <p style={styles.muted}>Comprobando…</p>}
        {ping === 'ok' && <p style={styles.ok}>{pingMsg}</p>}
        {ping === 'error' && supabaseConfigured && <p style={styles.err}>{pingMsg}</p>}
        {ping === 'error' && !supabaseConfigured && <p style={styles.err}>{pingMsg}</p>}
      </section>

      <footer style={styles.footer}>
        <a href="https://apps.apple.com" style={styles.link}>
          App Store (cuando publiques)
        </a>
        {' · '}
        <span style={styles.muted}>Android: APK / Play cuando corresponda</span>
      </footer>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#FDFBF7',
    color: '#0F172A',
    fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
    padding: '2rem 1.25rem',
    maxWidth: 560,
    margin: '0 auto',
  },
  hero: { marginBottom: '2rem' },
  title: {
    fontSize: '2rem',
    fontWeight: 800,
    color: '#0F3B25',
    margin: 0,
    letterSpacing: '-0.02em',
  },
  subtitle: { margin: '0.5rem 0 0', color: '#64748B', fontSize: '1rem', lineHeight: 1.5 },
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: '1.25rem',
    boxShadow: '0 4px 24px rgba(15, 59, 37, 0.08)',
    border: '1px solid rgba(15, 59, 37, 0.08)',
  },
  h2: { fontSize: '1rem', margin: '0 0 0.75rem', color: '#0F3B25' },
  muted: { color: '#64748B', fontSize: '0.9rem' },
  ok: { color: '#166534', fontSize: '0.95rem', margin: 0 },
  err: { color: '#b91c1c', fontSize: '0.95rem', margin: 0 },
  warn: { color: '#92400e', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 },
  code: { background: '#f1f5f9', padding: '0.1em 0.35em', borderRadius: 4, fontSize: '0.85em' },
  footer: { marginTop: '2.5rem', fontSize: '0.85rem' },
  link: { color: '#0F3B25', fontWeight: 600 },
};
