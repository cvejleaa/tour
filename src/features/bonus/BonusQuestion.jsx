// ---------------------------------------------------------------------------
// BonusQuestion – ét bonusspørgsmål med svar-input, låst-tilstand og facit.
// Generisk: fritekst-svar, eller valg af cykelhold hvis spørgsmålet har options.
// ---------------------------------------------------------------------------
import { useState, useEffect } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { TOUR_TEAMS, prettyTeam } from '../../data/tourTeams2026';
import { isBonusLocked, formatDeadline, bonusAnswerType, formatBonusAnswer, isBonusAnswerEmpty } from './bonusHelpers';
import BonusAnswers from './BonusAnswers';

/**
 * Type-passende svar-input for spilleren.
 * - team / legacy-options → enkelt-dropdown (data-testid bonus-select)
 * - teams → checkbox-liste (data-testid bonus-teams)
 * - boolean → Ja/Nej-dropdown (data-testid bonus-select)
 * - number/time/text → tekst-/tal-input (data-testid bonus-input)
 */
function AnswerInput({ type, legacyOptions, value, onChange, disabled }) {
  // Legacy: eksplicitte options → dropdown over dem.
  if (legacyOptions) {
    return (
      <select
        className="select"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        data-testid="bonus-select"
        style={{ maxWidth: 300 }}
      >
        <option value="">– Vælg hold –</option>
        {legacyOptions.map((opt) => (
          <option key={opt} value={opt}>{prettyTeam(opt)}</option>
        ))}
      </select>
    );
  }

  if (type === 'team') {
    return (
      <select
        className="select"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        data-testid="bonus-select"
        style={{ maxWidth: 300 }}
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
      const next = selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t];
      onChange(next);
    };
    return (
      <div
        data-testid="bonus-teams"
        style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', maxWidth: 300, maxHeight: 200, overflowY: 'auto' }}
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
        className="select"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        data-testid="bonus-select"
        style={{ maxWidth: 300 }}
      >
        <option value="">– Vælg –</option>
        <option value="ja">Ja</option>
        <option value="nej">Nej</option>
      </select>
    );
  }

  // number / time / text
  return (
    <input
      type={type === 'number' ? 'number' : 'text'}
      className="input"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={type === 'time' ? 'fx 1:23' : 'Dit svar...'}
      data-testid="bonus-input"
      style={{ maxWidth: 300 }}
    />
  );
}

/**
 * @param {{
 *   question: object,
 *   uid: string,
 *   existingBet: object|null,
 *   isAdmin?: boolean,
 *   usersByUid?: object,
 *   visibleUids?: Set<string>|null,
 * }} props
 */
export default function BonusQuestion({ question, uid, existingBet, isAdmin = false, usersByUid = {}, visibleUids = null }) {
  const locked = isBonusLocked(question.deadline);
  const type = bonusAnswerType(question);

  // Hvis spørgsmålet har eksplicitte options (legacy), vis dropdown med dem.
  const options = question.options ?? null;
  const isLegacySelect = !!(options && options.length > 0);

  // Tom startværdi: array for 'teams', ellers tom streng.
  const emptyAnswer = type === 'teams' ? [] : '';
  const [answer, setAnswer] = useState(existingBet?.answer ?? emptyAnswer);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Synkroniser eksternt svar (fx ved load)
  useEffect(() => {
    setAnswer(existingBet?.answer ?? (type === 'teams' ? [] : ''));
  }, [existingBet?.answer, type]);

  const answerEmpty = isBonusAnswerEmpty(answer);

  async function handleSave() {
    if (answerEmpty || locked) return;
    setSaving(true);
    setError('');
    try {
      const betId = `${uid}_${question.id}`;
      // Gem svaret i naturlig form: array for 'teams', trimmet streng ellers.
      const value = Array.isArray(answer) ? answer : String(answer).trim();
      await setDoc(
        doc(db, COL.BONUS_BETS, betId),
        {
          uid,
          questionId: question.id,
          answer: value,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error('Kunne ikke gemme bonus-svar:', e);
      setError('Kunne ikke gemme. Prøv igen.');
    } finally {
      setSaving(false);
    }
  }

  const setAnswerAndReset = (v) => { setAnswer(v); setSaved(false); };
  const questionText = question.text ?? question.label ?? '';
  const questionPoints = Number(question.points) || 0;

  // Afgør status
  const isAnswered = existingBet?.answer != null && !isBonusAnswerEmpty(existingBet.answer);
  const isFinished = Array.isArray(question.facit) ? question.facit.length > 0 : !!question.facit;
  const earnedPoints = existingBet?.points ?? null;

  return (
    <div
      className="card"
      style={{ marginBottom: '0.75rem' }}
      data-testid="bonus-question"
    >
      {/* Spørgsmålstekst */}
      <div style={{ marginBottom: '0.6rem' }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: '1rem' }}>
          {questionText}
        </p>
        <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--c-muted)' }}>
          Deadline: {formatDeadline(question.deadline)}
          {!locked && (
            <span
              className="badge badge--blue"
              style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}
            >
              Åben
            </span>
          )}
          {locked && (
            <span
              className="badge badge--red"
              style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}
            >
              Låst
            </span>
          )}
        </p>
      </div>

      {/* Facit og point hvis afgjort */}
      {isFinished && (
        <div
          style={{
            background: 'rgba(31,157,85,0.07)',
            borderRadius: 8,
            padding: '0.5rem 0.75rem',
            marginBottom: '0.5rem',
            fontSize: '0.88rem',
          }}
        >
          <strong>Facit:</strong>{' '}
          {isLegacySelect ? prettyTeam(question.facit) : formatBonusAnswer(question.facit, type)}
          {earnedPoints !== null && (
            <span
              className={`badge ${earnedPoints > 0 ? 'badge--green' : 'badge--muted'}`}
              style={{ marginLeft: '0.75rem' }}
            >
              {earnedPoints > 0 ? `+${earnedPoints} point` : '0 point'}
            </span>
          )}
        </div>
      )}

      {/* Svar-felt */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <AnswerInput
          type={type}
          legacyOptions={isLegacySelect ? options : null}
          value={answer}
          onChange={setAnswerAndReset}
          disabled={locked}
        />

        {!locked && (
          <button
            className="btn"
            onClick={handleSave}
            disabled={saving || answerEmpty}
            data-testid="bonus-save"
            style={{ whiteSpace: 'nowrap' }}
          >
            {saving ? 'Gemmer…' : 'Gem svar'}
          </button>
        )}
      </div>

      {/* Feedback */}
      {saved && (
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.82rem', color: 'var(--c-ok)' }}>
          ✓ Svar gemt!
        </p>
      )}
      {error && (
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.82rem', color: 'var(--c-err)' }}>
          {error}
        </p>
      )}

      {/* Vis brugerens eget svar */}
      {isAnswered && (
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.83rem', color: 'var(--c-muted)' }}>
          Dit svar:{' '}
          <strong style={{ color: 'var(--c-text)' }}>
            {isLegacySelect ? prettyTeam(existingBet.answer) : formatBonusAnswer(existingBet.answer, type)}
          </strong>
        </p>
      )}

      {/* Mulige point-info */}
      {!locked && !isFinished && questionPoints > 0 && (
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: 'var(--c-muted)' }}>
          Korrekt svar giver {questionPoints} point. Låses ved deadline.
        </p>
      )}

      {/* Alle svar — efter låsning for alle, altid for admin */}
      {(locked || isAdmin) && (
        <BonusAnswers
          question={question}
          meUid={uid}
          usersByUid={usersByUid}
          visibleUids={visibleUids}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
