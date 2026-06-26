// Bonus-fanen i admin-panelet.
// Lader global admin og owner sætte facit på bonusspørgsmål.
import { useState } from 'react';
import { useBonusQuestions } from './useBonusQuestions';
import { saveBonusFacit, callSyncGroupWinners, formatTimestamp } from './adminActions';
import { BONUS_TYPE } from '../../lib/constants';
import { sortBonusQuestions } from '../bonus/bonusHelpers';
import BonusSubmissions from './BonusSubmissions';
import { useTopScorers } from '../stats/useTopScorers';

// Oversæt type til dansk
const TYPE_LABELS = {
  [BONUS_TYPE.TOP_SCORER]:  'Topscorer',
  [BONUS_TYPE.GROUP_WINNER]:'Gruppevinder',
};

const inputStyle = {
  padding: '0.5rem 0.6rem',
  border: '1px solid var(--c-border)',
  borderRadius: 8,
  fontSize: '0.95rem',
  background: 'var(--c-bg)',
  color: 'var(--c-text)',
  width: '100%',
};

export default function BonusTab() {
  const { questions: rawQuestions, loading, error } = useBonusQuestions();
  const { list: topScorers } = useTopScorers();
  const topScorerLeader = topScorers?.[0]?.playerName || null;
  const questions = sortBonusQuestions(rawQuestions);
  const [editing, setEditing] = useState({}); // { [questionId]: string }
  const [busy, setBusy] = useState({});        // { [questionId]: boolean }
  const [msgs, setMsgs] = useState({});        // { [questionId]: string }
  const [gwBusy, setGwBusy] = useState(false);
  const [gwMsg, setGwMsg] = useState('');

  async function handleSyncGroupWinners(dryRun) {
    if (!dryRun && !window.confirm('Afgør gruppevindere ud fra grupperesultaterne nu?')) return;
    setGwBusy(true); setGwMsg('');
    const res = await callSyncGroupWinners({ dryRun });
    setGwBusy(false);
    if (!res.ok) { setGwMsg(`Fejl: ${res.error}`); return; }
    const d = res.data ?? {};
    const groups = (d.changes ?? []).map((c) => `${c.groupName}→${c.facit}`).join(', ');
    setGwMsg(
      `${dryRun ? 'Tør-kør' : 'Afgjort'}: ${d.resolved ?? 0} gruppevinder(e)`
      + `${groups ? ` (${groups})` : ''}, ${d.pending ?? 0} afventer færdigspil.`,
    );
  }

  function startEdit(q) {
    setEditing((prev) => ({ ...prev, [q.id]: q.facit ?? '' }));
    setMsgs((prev) => ({ ...prev, [q.id]: '' }));
  }

  function cancelEdit(id) {
    setEditing((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  }

  async function handleSave(q) {
    const facit = editing[q.id]?.trim();
    if (!facit) {
      setMsgs((prev) => ({ ...prev, [q.id]: 'Facit må ikke være tomt.' }));
      return;
    }

    if (!window.confirm(`Sæt facit "${facit}" for "${q.label}"?`)) return;

    setBusy((prev) => ({ ...prev, [q.id]: true }));
    try {
      await saveBonusFacit(q.id, facit);
      setMsgs((prev) => ({ ...prev, [q.id]: 'Gemt!' }));
      cancelEdit(q.id);
    } catch (err) {
      setMsgs((prev) => ({
        ...prev,
        [q.id]: 'Fejl: ' + (err.message ?? 'Ukendt fejl'),
      }));
    } finally {
      setBusy((prev) => ({ ...prev, [q.id]: false }));
    }
  }

  if (loading) {
    return <p style={{ color: 'var(--c-muted)' }}>Henter bonusspørgsmål…</p>;
  }

  if (error) {
    return (
      <p role="alert" style={{ color: 'var(--c-err)' }}>
        {error}
      </p>
    );
  }

  if (questions.length === 0) {
    return <p style={{ color: 'var(--c-muted)' }}>Ingen bonusspørgsmål oprettet endnu.</p>;
  }

  return (
    <>
      {/* Auto-afgør gruppevindere ud fra grupperesultaterne */}
      <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          className="btn"
          disabled={gwBusy}
          onClick={() => handleSyncGroupWinners(false)}
          style={{ fontSize: '0.85rem', padding: '0.35rem 0.8rem' }}
        >
          {gwBusy ? 'Afgør…' : '🏆 Afgør gruppevindere'}
        </button>
        <button
          className="btn btn--ghost"
          disabled={gwBusy}
          onClick={() => handleSyncGroupWinners(true)}
          style={{ fontSize: '0.85rem', padding: '0.35rem 0.8rem' }}
        >
          Tør-kør
        </button>
        {gwMsg && (
          <span style={{ fontSize: '0.82rem', color: gwMsg.startsWith('Fejl') ? 'var(--c-err)' : 'var(--c-muted)' }}>
            {gwMsg}
          </span>
        )}
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {questions.map((q) => {
        const isEditing = q.id in editing;
        const isBusy = busy[q.id] ?? false;
        const msg = msgs[q.id] ?? '';

        return (
          <li
            key={q.id}
            style={{
              padding: '0.75rem 0',
              borderBottom: '1px solid var(--c-border)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '0.5rem',
                flexWrap: 'wrap',
              }}
            >
              {/* Info */}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{q.label}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--c-muted)' }}>
                  {TYPE_LABELS[q.type] ?? q.type}
                  {q.groupName ? ` · Gruppe ${q.groupName}` : ''}
                  {' · Deadline: '}
                  {formatTimestamp(q.deadline)}
                </div>
                <div style={{ marginTop: 2, fontSize: '0.82rem' }}>
                  Facit:{' '}
                  {q.facit ? (
                    <strong style={{ color: 'var(--c-ok)' }}>{q.facit}</strong>
                  ) : (
                    <span style={{ color: 'var(--c-warn)' }}>Ikke sat</span>
                  )}
                </div>

                {/* Valgmuligheder */}
                {q.options?.length > 0 && (
                  <div style={{ marginTop: 4, fontSize: '0.78rem', color: 'var(--c-muted)' }}>
                    Valgmuligheder: {q.options.join(', ')}
                  </div>
                )}

                {/* Feedback */}
                {msg && (
                  <div
                    style={{
                      fontSize: '0.8rem',
                      marginTop: 4,
                      color: msg.startsWith('Fejl') ? 'var(--c-err)' : 'var(--c-ok)',
                    }}
                  >
                    {msg}
                  </div>
                )}
              </div>

              {/* Rediger-knap */}
              {!isEditing && (
                <button
                  className="btn btn--ghost"
                  style={{ fontSize: '0.82rem', padding: '0.3rem 0.7rem', whiteSpace: 'nowrap' }}
                  onClick={() => startEdit(q)}
                >
                  Sæt facit
                </button>
              )}
            </div>

            {/* Facit-input */}
            {isEditing && (
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {/* Dropdown hvis der er options, ellers fritekst */}
                {q.options?.length > 0 ? (
                  <select
                    value={editing[q.id]}
                    onChange={(e) =>
                      setEditing((prev) => ({ ...prev, [q.id]: e.target.value }))
                    }
                    style={{ ...inputStyle, flex: 1 }}
                  >
                    <option value="">Vælg…</option>
                    {q.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={editing[q.id]}
                    onChange={(e) =>
                      setEditing((prev) => ({ ...prev, [q.id]: e.target.value }))
                    }
                    placeholder="Facit…"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                )}
                {q.type === BONUS_TYPE.TOP_SCORER && topScorerLeader && (
                  <button
                    className="btn btn--ghost"
                    type="button"
                    disabled={isBusy}
                    title="Indsæt den nuværende topscorer fra football-data"
                    onClick={() => setEditing((prev) => ({ ...prev, [q.id]: topScorerLeader }))}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    ⚽ {topScorerLeader}
                  </button>
                )}
                <button
                  className="btn"
                  disabled={isBusy}
                  onClick={() => handleSave(q)}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {isBusy ? 'Gemmer…' : 'Gem'}
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() => cancelEdit(q.id)}
                  disabled={isBusy}
                >
                  Annuller
                </button>
              </div>
            )}

            {/* Topscorer: indsendte svar + manuel godkendelse af stavevarianter */}
            {q.type === BONUS_TYPE.TOP_SCORER && <BonusSubmissions question={q} />}
          </li>
        );
      })}
      </ul>
    </>
  );
}
