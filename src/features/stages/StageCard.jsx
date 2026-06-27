// ---------------------------------------------------------------------------
// StageCard – én etape med de fire hold-tip-felter (Q1–Q4), låst-tilstand,
// resultat og optjente point. Hold-spillets hjerte.
// ---------------------------------------------------------------------------
import { useState, useEffect, useCallback } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { scoreStageBet, STAGE_FIELDS } from '../../lib/tourScoring';
import { stageStatus } from '../../lib/tourStages';
import { prettyTeam } from '../../data/tourTeams2026';
import TeamBadge from '../../components/TeamBadge';

const STAGE_TYPE_LABEL = {
  flat: '🟢 Flad', hilly: '🟡 Kuperet', mountain: '🔴 Bjerg',
  itt: '⏱️ Enkeltstart', ttt: '⏱️ Holdtidskørsel', unknown: 'Etape',
};

// De fire spørgsmål i visningsrækkefølge.
const QUESTIONS = [
  { key: 'winnerTeam', icon: '🏆', label: 'Etapevinderens hold' },
  { key: 'gcTeam', icon: '⏱️', label: 'Bedste hold (de første ryttere)' },
  { key: 'mountainTeam', icon: '⛰️', label: 'Flest bjergpoint' },
  { key: 'sprintTeam', icon: '🚀', label: 'Flest sprintpoint' },
];

function formatDate(kickoff) {
  if (!kickoff) return '';
  const d = kickoff?.toDate ? kickoff.toDate() : new Date(kickoff);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function StageCard({ stage, uid, bet, teams = [], points = {} }) {
  const status = stageStatus(stage, Date.now());
  const locked = status !== 'scheduled';
  const isDone = status === 'done';

  const [picks, setPicks] = useState({
    winnerTeam: bet?.winnerTeam ?? '',
    gcTeam: bet?.gcTeam ?? '',
    mountainTeam: bet?.mountainTeam ?? '',
    sprintTeam: bet?.sprintTeam ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setPicks({
      winnerTeam: bet?.winnerTeam ?? '',
      gcTeam: bet?.gcTeam ?? '',
      mountainTeam: bet?.mountainTeam ?? '',
      sprintTeam: bet?.sprintTeam ?? '',
    });
  }, [bet?.winnerTeam, bet?.gcTeam, bet?.mountainTeam, bet?.sprintTeam]);

  const hasBet = STAGE_FIELDS.some(({ key }) => bet?.[key]);
  const result = isDone ? stage.result : null;
  const scored = result ? scoreStageBet(bet, result, points) : null;

  const save = useCallback(async (next) => {
    if (!uid || locked) return;
    setSaving(true);
    setError('');
    try {
      await setDoc(
        doc(db, COL.STAGE_BETS, `${uid}_${stage.id}`),
        { uid, stageId: stage.id, season: stage.season ?? null, ...next, updatedAt: serverTimestamp() },
        { merge: true },
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      console.error('Kunne ikke gemme etape-tip:', e);
      setError('Kunne ikke gemme. Prøv igen.');
    } finally {
      setSaving(false);
    }
  }, [uid, locked, stage.id, stage.season]);

  function onPick(key, value) {
    const next = { ...picks, [key]: value };
    setPicks(next);
    save(next);
  }

  const borderColor = locked
    ? (isDone ? 'var(--c-pitch)' : 'var(--c-err)')
    : (hasBet ? 'var(--c-pitch)' : 'var(--c-warn)');

  return (
    <div className="card" data-testid="stage-card" style={{ marginBottom: '0.6rem', borderLeft: `4px solid ${borderColor}` }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.5rem' }}>
        <span style={{ fontWeight: 800 }}>
          Etape {stage.number}
          <span style={{ fontWeight: 600, color: 'var(--c-muted)', marginLeft: '0.5rem', fontSize: '0.85rem' }}>
            {STAGE_TYPE_LABEL[stage.type] || ''}{stage.startCity ? ` · ${stage.startCity} → ${stage.finishCity ?? ''}` : ''}{stage.km != null ? ` · ${stage.km} km` : ''}
          </span>
        </span>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          {!locked && hasBet && <span className="badge badge--green" style={{ fontSize: '0.72rem' }}>✓ Tippet</span>}
          {!locked && !hasBet && <span className="badge badge--yellow" style={{ fontSize: '0.72rem' }}>Mangler tip</span>}
          <span style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>{formatDate(stage.kickoff)}</span>
          {locked && <span className={`badge ${isDone ? 'badge--green' : 'badge--red'}`} style={{ fontSize: '0.72rem' }}>{isDone ? '✓ Afgjort' : '🔒 Låst'}</span>}
        </div>
      </div>

      {/* Optjente point */}
      {scored && (
        <div style={{ marginBottom: '0.5rem' }}>
          <span className={`badge ${scored.points > 0 ? 'badge--green' : 'badge--muted'}`} data-testid="stage-points">
            {scored.points > 0 ? `+${scored.points} point` : `${scored.points} point`}
          </span>
        </div>
      )}

      {/* De fire spørgsmål */}
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {QUESTIONS.map(({ key, icon, label }) => {
          const facit = result?.[key];
          const hit = facit && picks[key] && picks[key] === facit;
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: 200 }}>
                {icon} {label}
              </span>
              {locked ? (
                <span style={{ fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {picks[key]
                    ? <strong><TeamBadge name={picks[key]} /></strong>
                    : <strong>—</strong>}
                  {facit && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: hit ? 'var(--c-ok)' : 'var(--c-muted)' }}>
                      (facit: <TeamBadge name={facit} />) {hit ? '✓' : ''}
                    </span>
                  )}
                </span>
              ) : (
                <select
                  value={picks[key]}
                  disabled={saving}
                  onChange={(e) => onPick(key, e.target.value)}
                  data-testid={`pick-${key}`}
                  style={{ flex: 1, minWidth: 160, padding: '0.4rem', borderRadius: 6, border: '1px solid var(--c-border, #ccc)' }}
                >
                  <option value="">– vælg hold –</option>
                  {teams.map((t) => <option key={t} value={t}>{prettyTeam(t)}</option>)}
                </select>
              )}
            </div>
          );
        })}
      </div>

      {saved && <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: 'var(--c-ok)' }}>✓ Gemt!</p>}
      {error && <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: 'var(--c-err)' }}>{error}</p>}
      {!locked && (
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.74rem', color: 'var(--c-muted)' }}>
          Op til {(points.winnerTeam ?? 5) + (points.gcTeam ?? 4) + (points.mountainTeam ?? 3) + (points.sprintTeam ?? 3)} point · gemmes automatisk · låses ved etapestart
        </p>
      )}

      {/* Om etapen – kollapset som standard. Viser mål-byens billede + tekst. */}
      {stage.description && (
        <details style={{ marginTop: '0.6rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: 'var(--c-muted)' }}>
            ℹ️ Om etapen
          </summary>
          <div style={{ marginTop: '0.5rem' }}>
            {stage.finishCity && (
              <p style={{ margin: '0 0 0.35rem', fontSize: '0.82rem', fontWeight: 700 }}>
                Om mål-byen {stage.finishCity}
              </p>
            )}
            {stage.image && (
              <img
                src={stage.image}
                alt={stage.finishCity || ''}
                loading="lazy"
                style={{ maxWidth: '100%', height: 'auto', borderRadius: 8, marginBottom: '0.4rem', display: 'block' }}
              />
            )}
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--c-muted)', lineHeight: 1.45 }}>
              {stage.description}
            </p>
          </div>
        </details>
      )}
    </div>
  );
}
