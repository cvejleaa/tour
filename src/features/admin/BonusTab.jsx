// Bonus-fanen i admin-panelet.
// Global admin/owner kan oprette generiske bonusspørgsmål (tekst + point + deadline)
// og sætte facit. Backend scorer svar generisk mod facit.
import { useState } from 'react';
import { useBonusQuestions } from './useBonusQuestions';
import { saveBonusFacit, createBonusQuestion, formatTimestamp } from './adminActions';
import { sortBonusQuestions, bonusAnswerType, formatBonusAnswer } from '../bonus/bonusHelpers';
import { BONUS_ANSWER_TYPES } from '../../lib/constants';
import { TOUR_TEAMS, prettyTeam } from '../../data/tourTeams2026';

const inputStyle = {
  padding: '0.5rem 0.6rem',
  border: '1px solid var(--c-border)',
  borderRadius: 8,
  fontSize: '0.95rem',
  background: 'var(--c-bg)',
  color: 'var(--c-text)',
  width: '100%',
};

/**
 * Type-passende facit-/svar-input. `value` er den naturlige værdi
 * (streng, eller array for 'teams'). `onChange(nextValue)` får samme form.
 */
function FacitInput({ type, value, onChange, disabled = false, testIdPrefix = 'facit', placeholder = 'Facit…' }) {
  const common = { ...inputStyle, flex: 1 };

  if (type === 'team') {
    return (
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={common}
        data-testid={`${testIdPrefix}-team`}
        aria-label="Facit (hold)"
      >
        <option value="">– Vælg hold –</option>
        {TOUR_TEAMS.map((t) => (
          <option key={t} value={t}>{prettyTeam(t)}</option>
        ))}
      </select>
    );
  }

  if (type === 'teams') {
    const selected = Array.isArray(value) ? value : [];
    const toggle = (t) => {
      const next = selected.includes(t)
        ? selected.filter((x) => x !== t)
        : [...selected, t];
      onChange(next);
    };
    return (
      <div
        data-testid={`${testIdPrefix}-teams`}
        style={{ ...common, display: 'flex', flexDirection: 'column', gap: '0.2rem', maxHeight: 180, overflowY: 'auto' }}
      >
        {TOUR_TEAMS.map((t) => (
          <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
            <input
              type="checkbox"
              checked={selected.includes(t)}
              onChange={() => toggle(t)}
              disabled={disabled}
            />
            {prettyTeam(t)}
          </label>
        ))}
      </div>
    );
  }

  if (type === 'boolean') {
    return (
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={common}
        data-testid={`${testIdPrefix}-boolean`}
        aria-label="Facit (ja/nej)"
      >
        <option value="">– Vælg –</option>
        <option value="ja">Ja</option>
        <option value="nej">Nej</option>
      </select>
    );
  }

  if (type === 'number') {
    return (
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Facit (tal)…"
        style={common}
        data-testid={`${testIdPrefix}-number`}
      />
    );
  }

  // text + time → tekst-input (time med formathint)
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={type === 'time' ? 'fx 1:23' : placeholder}
      style={common}
      data-testid={`${testIdPrefix}-text`}
    />
  );
}

/** Tom startværdi for en given type (array for 'teams', ellers tom streng). */
function emptyFacitFor(type) {
  return type === 'teams' ? [] : '';
}

/** Er facit-værdien udfyldt nok til at kunne gemmes? */
function facitFilled(value) {
  if (Array.isArray(value)) return value.length > 0;
  return String(value ?? '').trim() !== '';
}

function CreateQuestionForm() {
  const [text, setText] = useState('');
  const [type, setType] = useState('text');
  const [points, setPoints] = useState('5');
  const [deadline, setDeadline] = useState('');
  const [facit, setFacit] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  function handleTypeChange(nextType) {
    setType(nextType);
    setFacit(emptyFacitFor(nextType));
  }

  async function handleCreate() {
    const t = text.trim();
    if (!t) { setMsg('Spørgsmålstekst må ikke være tom.'); return; }
    const p = Number(points);
    if (!Number.isFinite(p) || p <= 0) { setMsg('Point skal være et positivt tal.'); return; }
    setBusy(true); setMsg('');
    try {
      // Normaliser facit til naturlig form; tomt → null (sættes senere).
      let facitValue = null;
      if (Array.isArray(facit)) {
        facitValue = facit.length ? facit : null;
      } else {
        const trimmed = String(facit ?? '').trim();
        facitValue = trimmed === '' ? null : trimmed;
      }
      await createBonusQuestion({ text: t, points: p, type, deadline: deadline || null, facit: facitValue });
      setText(''); setType('text'); setPoints('5'); setDeadline(''); setFacit('');
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
        <label style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>Spørgsmål</label>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Spørgsmål, fx: Hvilket hold vinder samlet?"
          style={inputStyle}
          data-testid="bonus-new-text"
        />
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.8rem', color: 'var(--c-muted)' }}>
            Type
            <select
              value={type}
              onChange={(e) => handleTypeChange(e.target.value)}
              style={{ ...inputStyle, maxWidth: 200 }}
              data-testid="bonus-new-type"
              aria-label="Type"
            >
              {BONUS_ANSWER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.8rem', color: 'var(--c-muted)' }}>
            Point
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
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.8rem', color: 'var(--c-muted)' }}>
            Deadline
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              style={{ ...inputStyle, maxWidth: 240 }}
              data-testid="bonus-new-deadline"
              aria-label="Deadline"
            />
          </label>
        </div>
        <label style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>Facit (valgfrit — kan sættes senere)</label>
        <div style={{ display: 'flex' }}>
          <FacitInput type={type} value={facit} onChange={setFacit} testIdPrefix="bonus-new-facit" placeholder="Facit (opret)…" />
        </div>
        <div>
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
    const type = bonusAnswerType(q);
    const initial = q.facit ?? emptyFacitFor(type);
    setEditing((prev) => ({ ...prev, [q.id]: initial }));
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
    const type = bonusAnswerType(q);
    const raw = editing[q.id];
    let facit;
    if (Array.isArray(raw)) {
      facit = raw;
    } else {
      facit = String(raw ?? '').trim();
    }
    if (!facitFilled(facit)) {
      setMsgs((prev) => ({ ...prev, [q.id]: 'Facit må ikke være tomt.' }));
      return;
    }

    const facitLabel = formatBonusAnswer(facit, type);
    if (!window.confirm(`Sæt facit "${facitLabel}" for "${q.text ?? q.label}"?`)) return;

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
                <div style={{ fontSize: '0.82rem', color: 'var(--c-muted)' }}>
                  Type: {BONUS_ANSWER_TYPES.find((t) => t.value === bonusAnswerType(q))?.label ?? 'Fritekst'}
                </div>
                <div style={{ marginTop: 2, fontSize: '0.82rem' }}>
                  Facit:{' '}
                  {(Array.isArray(q.facit) ? q.facit.length > 0 : q.facit) ? (
                    <strong style={{ color: 'var(--c-ok)' }}>{formatBonusAnswer(q.facit, bonusAnswerType(q))}</strong>
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
                {/* Legacy: eksplicitte options → dropdown. Ellers type-baseret input. */}
                {q.options?.length > 0 ? (
                  <select
                    value={editing[q.id] ?? ''}
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
                  <FacitInput
                    type={bonusAnswerType(q)}
                    value={editing[q.id]}
                    onChange={(next) => setEditing((prev) => ({ ...prev, [q.id]: next }))}
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
