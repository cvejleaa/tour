/**
 * OnboardingChecklist — kort velkomst for nye brugere med de første trin.
 * Kan skjules; valget huskes pr. bruger i localStorage.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';

const STEPS = [
  { to: '/kampe', emoji: '⚽', title: 'Tip kampene', text: 'Gæt resultatet inden kickoff – tips låses ved kampstart.' },
  { to: '/bonus', emoji: '🎁', title: 'Svar på bonus', text: 'Topscorer, gruppevindere m.m. giver ekstra point.' },
  { to: '/ligaer', emoji: '🏆', title: 'Opret eller join en liga', text: 'Dyst mod vennerne – og svar på ligaens egne spørgsmål.' },
  { to: '/hjaelp', emoji: '❓', title: 'Læs “Sådan virker det”', text: 'Hurtigt overblik over point, deadlines og ligaer.' },
];

function storageKey(uid) {
  return `vm:onboarded:${uid || 'anon'}`;
}

export default function OnboardingChecklist({ uid }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(storageKey(uid)) === '1'; } catch { return false; }
  });

  if (dismissed) return null;

  function dismiss() {
    try { localStorage.setItem(storageKey(uid), '1'); } catch { /* ignore */ }
    setDismissed(true);
  }

  return (
    <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--c-pitch)' }}>
      <div className="flex items-center justify-between mb-2" style={{ gap: '0.5rem' }}>
        <h2 className="card__title" style={{ margin: 0 }}>👋 Velkommen!</h2>
        <button className="btn btn--ghost btn--sm" onClick={dismiss}>Forstået, skjul</button>
      </div>
      <p style={{ margin: '0 0 0.75rem', color: 'var(--c-muted)', fontSize: '0.9rem' }}>
        Kom godt i gang i fire trin:
      </p>
      <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {STEPS.map((s, i) => (
          <Link key={s.to} to={s.to}
            style={{
              textDecoration: 'none', color: 'var(--c-text)', padding: '0.6rem 0.75rem',
              borderRadius: 10, background: 'var(--c-surface-2, rgba(0,0,0,0.03))',
              display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
            }}
          >
            <span style={{ fontSize: '1.3rem' }}>{s.emoji}</span>
            <span>
              <span style={{ fontWeight: 700, display: 'block' }}>{i + 1}. {s.title}</span>
              <span style={{ fontSize: '0.82rem', color: 'var(--c-muted)' }}>{s.text}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
