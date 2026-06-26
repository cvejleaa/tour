// Formular til at oprette en ny kamp i Firestore.
// Bruges i admin-panelet under Kampe & resultater-fanen.
import { useState } from 'react';
import { createMatch, datetimeToTimestamp } from './adminActions';
import { ROUNDS, MATCH_STATUS } from '../../lib/constants';

const inputStyle = {
  width: '100%',
  padding: '0.5rem 0.6rem',
  border: '1px solid var(--c-border)',
  borderRadius: 8,
  fontSize: '0.95rem',
  background: 'var(--c-bg)',
  color: 'var(--c-text)',
  marginTop: '0.25rem',
};

const labelStyle = {
  fontSize: '0.82rem',
  fontWeight: 600,
  color: 'var(--c-muted)',
  display: 'block',
};

// Oversæt runder til dansk
const ROUND_LABELS = {
  [ROUNDS.GROUP]:  'Gruppe',
  [ROUNDS.R32]:    '1/16-finale',
  [ROUNDS.R16]:    '1/8-finale',
  [ROUNDS.QF]:     'Kvartfinale',
  [ROUNDS.SF]:     'Semifinale',
  [ROUNDS.BRONZE]: 'Bronzekamp',
  [ROUNDS.FINAL]:  'Finale',
};

/**
 * @param {{ onClose: function }} props
 */
export default function MatchCreateForm({ onClose }) {
  const [round, setRound] = useState(ROUNDS.GROUP);
  const [groupName, setGroupName] = useState('');
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [kickoff, setKickoff] = useState('');
  const [stadium, setStadium] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!kickoff) {
      setError('Angiv venligst afsparktidspunkt.');
      return;
    }

    setBusy(true);
    try {
      await createMatch({
        round,
        groupName: round === ROUNDS.GROUP ? groupName.toUpperCase() : null,
        homeTeam: homeTeam.toUpperCase() || null,
        awayTeam: awayTeam.toUpperCase() || null,
        homePlaceholder: homeTeam ? null : `Hold fra gruppe ${groupName}`,
        awayPlaceholder: awayTeam ? null : `Hold fra gruppe ${groupName}`,
        kickoff: datetimeToTimestamp(kickoff),
        status: MATCH_STATUS.SCHEDULED,
        stadium: stadium.trim() || null,
        city: city.trim() || null,
      });
      onClose();
    } catch (err) {
      setError('Kunne ikke oprette kampen: ' + (err.message ?? 'Ukendt fejl'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="card"
      style={{ marginTop: '1rem', border: '2px solid var(--c-pitch)' }}
    >
      <h3 style={{ margin: '0 0 1rem', color: 'var(--c-pitch)' }}>Opret ny kamp</h3>
      <form onSubmit={handleSubmit} noValidate>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          {/* Runde */}
          <div>
            <label style={labelStyle}>Runde</label>
            <select
              value={round}
              onChange={(e) => setRound(e.target.value)}
              style={{ ...inputStyle }}
            >
              {Object.entries(ROUND_LABELS).map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </select>
          </div>

          {/* Gruppe (kun gruppespil) */}
          {round === ROUNDS.GROUP && (
            <div>
              <label style={labelStyle}>Gruppe (A–H)</label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                maxLength={1}
                placeholder="A"
                style={inputStyle}
              />
            </div>
          )}

          {/* Hjemmehold */}
          <div>
            <label style={labelStyle}>Hjemmehold (landekode)</label>
            <input
              type="text"
              value={homeTeam}
              onChange={(e) => setHomeTeam(e.target.value)}
              placeholder="DNK"
              maxLength={10}
              style={inputStyle}
            />
          </div>

          {/* Udehold */}
          <div>
            <label style={labelStyle}>Udehold (landekode)</label>
            <input
              type="text"
              value={awayTeam}
              onChange={(e) => setAwayTeam(e.target.value)}
              placeholder="NOR"
              maxLength={10}
              style={inputStyle}
            />
          </div>

          {/* Afspark */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Afspark (dato & tid)</label>
            <input
              type="datetime-local"
              value={kickoff}
              onChange={(e) => setKickoff(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          {/* Stadion */}
          <div>
            <label style={labelStyle}>Stadion</label>
            <input
              type="text"
              value={stadium}
              onChange={(e) => setStadium(e.target.value)}
              placeholder="MetLife Stadium"
              style={inputStyle}
            />
          </div>

          {/* By */}
          <div>
            <label style={labelStyle}>By</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="New York"
              style={inputStyle}
            />
          </div>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              color: 'var(--c-err)',
              fontSize: '0.82rem',
              marginTop: '0.75rem',
              padding: '0.4rem 0.6rem',
              background: '#fef2f2',
              borderRadius: 6,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button type="submit" className="btn" disabled={busy} style={{ flex: 1 }}>
            {busy ? 'Opretter…' : 'Opret kamp'}
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
    </div>
  );
}
