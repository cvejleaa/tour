// ---------------------------------------------------------------------------
// BonusQuestion – ét bonusspørgsmål med svar-input, låst-tilstand og facit.
// ---------------------------------------------------------------------------
import { useState, useEffect } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL, BONUS_TYPE } from '../../lib/constants';
import { POINTS } from '../../lib/scoring';
import { teamName } from '../../lib/teams';
import Flag from '../../components/Flag';
import { isBonusLocked, formatDeadline } from './bonusHelpers';
import BonusAnswers from './BonusAnswers';

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
  const [answer, setAnswer] = useState(existingBet?.answer ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Synkroniser eksternt svar (fx ved load)
  useEffect(() => {
    setAnswer(existingBet?.answer ?? '');
  }, [existingBet?.answer]);

  async function handleSave() {
    if (!answer.trim() || locked) return;
    setSaving(true);
    setError('');
    try {
      const betId = `${uid}_${question.id}`;
      await setDoc(
        doc(db, COL.BONUS_BETS, betId),
        {
          uid,
          questionId: question.id,
          answer: answer.trim(),
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

  // Udled hvilke options der er tilgængelige
  const options = question.options ?? null;
  const isSelect = options && options.length > 0;
  const isGroupWinner = question.type === BONUS_TYPE.GROUP_WINNER;

  // Afgør status-badge
  const isAnswered = !!existingBet?.answer;
  const isFinished = !!question.facit;
  const earnedPoints = existingBet?.points ?? null;

  return (
    <div
      className="card"
      style={{ marginBottom: '0.75rem' }}
      data-testid="bonus-question"
    >
      {/* Spørgsmålstekst */}
      <div style={{ marginBottom: '0.6rem' }}>
        <span
          className="badge badge--blue"
          style={{ marginBottom: '0.4rem', display: 'inline-block' }}
        >
          {question.type === BONUS_TYPE.TOP_SCORER ? '⚽ Topscorer' : '🏆 Gruppevinder'}
        </span>
        <p style={{ margin: 0, fontWeight: 600, fontSize: '1rem' }}>
          {question.label}
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
          {isGroupWinner && <Flag code={question.facit} size={18} style={{ marginRight: 4 }} />}
          {isGroupWinner ? teamName(question.facit) : question.facit}
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
        {isSelect ? (
          <select
            className="select"
            value={answer}
            onChange={(e) => { setAnswer(e.target.value); setSaved(false); }}
            disabled={locked}
            data-testid="bonus-select"
            style={{ maxWidth: 300 }}
          >
            <option value="">– Vælg hold –</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>{teamName(opt)}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            className="input"
            value={answer}
            onChange={(e) => { setAnswer(e.target.value); setSaved(false); }}
            disabled={locked}
            placeholder="Dit svar..."
            data-testid="bonus-input"
            style={{ maxWidth: 300 }}
          />
        )}

        {!locked && (
          <button
            className="btn"
            onClick={handleSave}
            disabled={saving || !answer.trim()}
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

      {/* Hjælpetekst for topscorer (fri tekst) */}
      {!locked && !isSelect && question.type === BONUS_TYPE.TOP_SCORER && (
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: 'var(--c-muted)' }}>
          Skriv spillerens navn — gerne efternavn, fx <em>Mbappé</em>, <em>Haaland</em> eller
          <em> Messi</em>. Store/små bogstaver, accenter og små stavefejl er ligegyldige —
          og admin kan godkende din stavemåde manuelt.
        </p>
      )}

      {/* Vis brugerens eget svar */}
      {isAnswered && (
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.83rem', color: 'var(--c-muted)' }}>
          Dit svar:{' '}
          {isGroupWinner && <Flag code={existingBet.answer} size={16} style={{ marginRight: 3 }} />}
          <strong style={{ color: 'var(--c-text)' }}>
            {isGroupWinner ? teamName(existingBet.answer) : existingBet.answer}
          </strong>
        </p>
      )}

      {/* Mulige point-info */}
      {!locked && !isFinished && (
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: 'var(--c-muted)' }}>
          Korrekt svar giver {POINTS.BONUS} point. Låses ved deadline (den første relevante kamps start).
        </p>
      )}

      {/* Alle svar — efter låsning for alle, altid for admin (som med kamp-tips) */}
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
