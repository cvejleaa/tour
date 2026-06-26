// Formular til at indtaste eller redigere resultatet på en kamp.
// Viser hjemmemål, udemål, og for knockout: videregående hold.
import { useState } from 'react';
import { saveMatchResult } from './adminActions';
import { ROUNDS } from '../../lib/constants';

// Runder der er knockout og kræver 'advance'-felt
const KNOCKOUT_ROUNDS = new Set([
  ROUNDS.R32,
  ROUNDS.R16,
  ROUNDS.QF,
  ROUNDS.SF,
  ROUNDS.BRONZE,
  ROUNDS.FINAL,
]);

const inputStyle = {
  width: '100%',
  padding: '0.5rem 0.6rem',
  border: '1px solid var(--c-border)',
  borderRadius: 8,
  fontSize: '0.95rem',
  background: 'var(--c-bg)',
  color: 'var(--c-text)',
};

/**
 * @param {{ match: object, onClose: function }} props
 */
export default function MatchResultForm({ match, onClose }) {
  const isKnockout = KNOCKOUT_ROUNDS.has(match.round);

  const [home, setHome] = useState(match.result?.home ?? '');
  const [away, setAway] = useState(match.result?.away ?? '');
  const [advance, setAdvance] = useState(match.result?.advance ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (home === '' || away === '') {
      setError('Angiv venligst begge scores.');
      return;
    }
    if (Number(home) < 0 || Number(away) < 0) {
      setError('Scores kan ikke være negative.');
      return;
    }
    if (isKnockout && !advance.trim()) {
      setError('Angiv venligst det videregående hold.');
      return;
    }

    if (!window.confirm(`Gem resultat ${home}–${away} for ${match.homeTeam ?? match.homePlaceholder} vs ${match.awayTeam ?? match.awayPlaceholder}?`)) {
      return;
    }

    setBusy(true);
    try {
      await saveMatchResult(match.id, {
        home: Number(home),
        away: Number(away),
        ...(isKnockout ? { advance: advance.trim() } : {}),
      });
      onClose();
    } catch (err) {
      setError('Kunne ikke gemme resultatet: ' + (err.message ?? 'Ukendt fejl'));
    } finally {
      setBusy(false);
    }
  }

  const matchTitle = `${match.homeTeam ?? match.homePlaceholder ?? '?'} vs ${match.awayTeam ?? match.awayPlaceholder ?? '?'}`;

  return (
    <form onSubmit={handleSubmit} noValidate style={{ marginTop: '0.5rem' }}>
      <strong style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
        {matchTitle}
      </strong>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
        {/* Hjemmemål */}
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--c-muted)' }}>Hjemmemål</label>
          <input
            type="number"
            min="0"
            max="99"
            value={home}
            onChange={(e) => setHome(e.target.value)}
            style={inputStyle}
            required
          />
        </div>

        <span style={{ paddingTop: '1.2rem', fontWeight: 700, color: 'var(--c-muted)' }}>–</span>

        {/* Udemål */}
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--c-muted)' }}>Udemål</label>
          <input
            type="number"
            min="0"
            max="99"
            value={away}
            onChange={(e) => setAway(e.target.value)}
            style={inputStyle}
            required
          />
        </div>
      </div>

      {/* Videregående hold (kun knockout) */}
      {isKnockout && (
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--c-muted)' }}>
            Videregående hold (landekode, fx &quot;DNK&quot;)
          </label>
          <input
            type="text"
            value={advance}
            onChange={(e) => setAdvance(e.target.value)}
            placeholder="DNK"
            style={inputStyle}
            maxLength={10}
          />
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            color: 'var(--c-err)',
            fontSize: '0.82rem',
            marginBottom: '0.5rem',
            padding: '0.4rem 0.6rem',
            background: '#fef2f2',
            borderRadius: 6,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" className="btn" disabled={busy} style={{ flex: 1 }}>
          {busy ? 'Gemmer…' : 'Gem resultat'}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onClose}
          disabled={busy}
        >
          Annuller
        </button>
      </div>
    </form>
  );
}
