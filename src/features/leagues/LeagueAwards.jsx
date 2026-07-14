/**
 * LeagueAwards — manuelle liga-point pr. medlem baseret på de FÆLLES
 * bonusspørgsmål. Manageren (eller global admin) vælger et fælles spørgsmål og
 * tildeler frit point til enkelte medlemmer (fx delvist rigtige svar).
 * Pointene tæller KUN i denne ligas stilling (under liga-bonus-delen).
 * Medlemmer ser en læse-visning af tildelingerne (transparens).
 */
import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { useBonusQuestions } from '../admin/useBonusQuestions';
import { formatBonusAnswer, formatDeadline } from '../bonus/bonusHelpers';
import { saveLeagueBonusAwards } from './leagueAwardActions';

export default function LeagueAwards({ leagueId, meUid, isManager, members = [], awards = [] }) {
  const { questions } = useBonusQuestions();
  const [selectedQid, setSelectedQid] = useState('');
  const [inputs, setInputs] = useState({}); // uid → strengværdi fra feltet
  const [answersByUid, setAnswersByUid] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const awardByQid = useMemo(
    () => Object.fromEntries((awards || []).map((a) => [a.questionId, a])),
    [awards],
  );
  const nameOf = (uid) => members.find((m) => m.uid === uid)?.displayName || 'Spiller';
  const question = questions.find((q) => q.id === selectedQid) || null;

  // Ved valg af spørgsmål: udfyld felterne med den eksisterende tildeling.
  useEffect(() => {
    if (!selectedQid) { setInputs({}); return; }
    const existing = awardByQid[selectedQid]?.awards || {};
    setInputs(Object.fromEntries(Object.entries(existing).map(([uid, p]) => [uid, String(p)])));
    setMsg('');
  }, [selectedQid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hent medlemmernes svar på det valgte spørgsmål som doms-grundlag.
  // Reglerne tillader først at læse andres svar efter deadline — før da viser
  // vi bare tildelingen uden svar (tolerant catch, som useLeagueBonus).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selectedQid) { setAnswersByUid({}); return; }
      try {
        const snap = await getDocs(query(
          collection(db, COL.BONUS_BETS),
          where('questionId', '==', selectedQid),
        ));
        if (cancelled) return;
        const map = {};
        snap.docs.forEach((d) => { const b = d.data(); map[b.uid] = b.answer; });
        setAnswersByUid(map);
      } catch {
        if (!cancelled) setAnswersByUid({});
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedQid]);

  async function save() {
    if (!question) return;
    setSaving(true); setMsg('');
    try {
      const res = await saveLeagueBonusAwards({
        leagueId,
        questionId: question.id,
        label: question.label,
        awards: inputs,
        updatedBy: meUid,
      });
      setMsg(res.deleted ? 'Tildelingen er fjernet.' : `Gemt — ${res.saved} medlem(mer) har fået point.`);
    } catch (e) {
      setMsg(`Fejl: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  // Læse-visning af eksisterende tildelinger (alle medlemmer kan se dem).
  const existingList = (awards || []).filter((a) => a.awards && Object.keys(a.awards).length);

  return (
    <div className="card mt-2" data-testid="league-awards">
      <h3 className="card__title mb-2">🎯 Individuelle point (fælles bonus)</h3>
      <p style={{ fontSize: '0.83rem', color: 'var(--c-muted)', marginTop: 0 }}>
        Point som {isManager ? 'du som manager' : 'ligaens manager'} tildeler enkelte medlemmer ud fra de
        fælles bonusspørgsmål (fx delvist rigtige svar). Tæller kun i denne ligas stilling.
      </p>

      {/* Eksisterende tildelinger — synlige for alle medlemmer */}
      {existingList.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 0.75rem', display: 'grid', gap: '0.4rem' }}>
          {existingList.map((a) => (
            <li key={a.id} data-testid="award-row" style={{ fontSize: '0.85rem' }}>
              <strong>{a.label || 'Bonusspørgsmål'}</strong>
              <span style={{ display: 'inline-flex', gap: '0.5rem', flexWrap: 'wrap', marginLeft: '0.5rem' }}>
                {Object.entries(a.awards).map(([uid, p]) => (
                  <span key={uid} className={`badge ${p > 0 ? 'badge--green' : 'badge--red'}`} style={{ fontSize: '0.72rem' }}>
                    {nameOf(uid)}: {p > 0 ? `+${p}` : p}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
      {existingList.length === 0 && !isManager && (
        <p style={{ fontSize: '0.83rem', color: 'var(--c-muted)' }}>Ingen individuelle point tildelt endnu.</p>
      )}

      {/* Redigering — kun manager/global admin */}
      {isManager && (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.85rem' }}>
            Fælles bonusspørgsmål:{' '}
            <select value={selectedQid} onChange={(e) => setSelectedQid(e.target.value)} data-testid="award-question">
              <option value="">— vælg spørgsmål —</option>
              {questions.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.label} ({formatDeadline(q.deadline)}){awardByQid[q.id] ? ' ✓' : ''}
                </option>
              ))}
            </select>
          </label>

          {question && (
            <>
              <div className="table-wrap">
                <table className="table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr><th>Medlem</th><th>Svar</th><th style={{ width: 90 }}>Point</th></tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.uid}>
                        <td style={{ fontWeight: 600 }}>{m.displayName || 'Spiller'}</td>
                        <td style={{ color: 'var(--c-muted)' }}>
                          {answersByUid[m.uid] != null
                            ? formatBonusAnswer(answersByUid[m.uid], question.type)
                            : <span style={{ opacity: 0.6 }}>—</span>}
                        </td>
                        <td>
                          <input
                            type="number"
                            value={inputs[m.uid] ?? ''}
                            onChange={(e) => setInputs((cur) => ({ ...cur, [m.uid]: e.target.value }))}
                            placeholder="0"
                            style={{ width: 70 }}
                            data-testid={`award-input-${m.uid}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn--sm" onClick={save} disabled={saving} data-testid="award-save">
                  {saving ? 'Gemmer…' : 'Gem tildeling'}
                </button>
                <span style={{ fontSize: '0.78rem', color: 'var(--c-muted)' }}>
                  Tomt felt eller 0 = ingen point. Negative tal er tilladt.
                </span>
                {msg && <span style={{ fontSize: '0.8rem' }}>{msg}</span>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
