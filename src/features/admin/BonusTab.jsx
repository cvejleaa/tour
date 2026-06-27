// Bonus-fanen i admin-panelet.
// Global admin/owner kan oprette generiske bonusspørgsmål (tekst + point + deadline)
// og sætte facit. Backend scorer svar generisk mod facit.
import { useState } from 'react';
import { useBonusQuestions } from './useBonusQuestions';
import { saveBonusFacit, createBonusQuestion, formatTimestamp } from './adminActions';
import { sortBonusQuestions } from '../bonus/bonusHelpers';

const inputStyle = {
  padding: '0.5rem 0.6rem',
  border: '1px solid var(--c-border)',
  borderRadius: 8,
  fontSize: '0.95rem',
  background: 'var(--c-bg)',
  color: 'var(--c-text)',
  width: '100%',
};

function CreateQuestionForm() {
  const [text, setText] = useState('');
  const [points, setPoints] = useState('5');
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function handleCreate() {
    const t = text.trim();
    if (!t) { setMsg('Spørgsmålstekst må ikke være tom.'); return; }
    const p = Number(points);
    if (!Number.isFinite(p) || p <= 0) { setMsg('Point skal være et positivt tal.'); return; }
    setBusy(true); setMsg('');
    try {
      await createBonusQuestion({ text: t, points: p, deadline: deadline || null });
      setText(''); setPoints('5'); setDeadline('');
      setMsg('Spørgsmål oprettet!');
    } catch (err) {
      setMsg('Fejl: ' + (err.message ?? 'Ukendt fejl'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: '1rem', padding: '0.85rem' }}>
      <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Opret bonusspørgsmål</div>
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Spørgsmål, fx: Hvilket hold vinder samlet?"
          style={inputStyle}
          data-testid="bonus-new-text"
        />
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="number"
            value={points}
            min="1"
            onChange={(e) => setPoints(e.target.value)}
            placeholder="Point"
            style={{ ...inputStyle, maxWidth: 120 }}
            data-testid="bonus-new-points"
            aria-label="Point"
          />
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            style={{ ...inputStyle, maxWidth: 240 }}
            data-testid="bonus-new-deadline"
            aria-label="Deadline"
          />
          <button className="btn" disabled={busy} onClick={handleCreate} data-testid="bonus-new-save">
            {busy ? 'Opretter…' : 'Opret'}
          </button>
        </div>
        {msg && (
          <div style={{ fontSize: '0.8rem', color: msg.startsWith('Fejl') ? 'var(--c-err)' : 'var(--c-ok)' }}>
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}

export default function BonusTab() {
  const { questions: rawQuestions, loading, error } = useBonusQuestions();
  const questions = sortBonusQuestions(rawQuestions);
  const [editing, setEditing] = useState({}); // { [questionId]: string }
  const [busy, setBusy] = useState({});        // { [questionId]: boolean }
  const [msgs, setMsgs] = useState({});        // { [questionId]: string }

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

    if (!window.confirm(`Sæt facit "${facit}" for "${q.text ?? q.label}"?`)) return;

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

  return (
    <>
      <CreateQuestionForm />

      {questions.length === 0 ? (
        <p style={{ color: 'var(--c-muted)' }}>Ingen bonusspørgsmål oprettet endnu.</p>
      ) : (
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
                <div style={{ fontWeight: 600 }}>{q.text ?? q.label}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--c-muted)' }}>
                  {`${Number(q.points) || 0} point`}
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
          </li>
        );
      })}
      </ul>
      )}
    </>
  );
}
