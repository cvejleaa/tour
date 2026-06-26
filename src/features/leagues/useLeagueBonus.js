/**
 * Hook: useLeagueBonus — ligaens egne bonusspørgsmål + svar.
 *
 * Sikkerhedsreglerne tillader kun at læse ANDRES svar efter spørgsmålets
 * deadline. Derfor:
 *  - egne svar hentes live (where uid == meUid)
 *  - alle svar (til point-beregning) hentes kun for spørgsmål hvis deadline
 *    er passeret (per-spørgsmål getDocs), så queryen ikke afvises.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  collection, onSnapshot, query, where, orderBy, getDocs,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { scoreLeagueBonus } from './leagueBonusScoring';

function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export function useLeagueBonus(leagueId, meUid, isManager = false) {
  const [questions, setQuestions] = useState([]);
  const [myAnswers, setMyAnswers] = useState({}); // qid -> answer
  const [othersByQid, setOthersByQid] = useState({}); // qid -> [{uid, answer}]
  const [loading, setLoading] = useState(true);

  // Spørgsmål (live)
  useEffect(() => {
    if (!leagueId) { setQuestions([]); setLoading(false); return undefined; }
    const q = query(
      collection(db, COL.LEAGUE_BONUS),
      where('leagueId', '==', leagueId),
      orderBy('createdAt', 'asc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setQuestions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [leagueId]);

  // Egne svar (live)
  useEffect(() => {
    if (!meUid) { setMyAnswers({}); return undefined; }
    const q = query(collection(db, COL.LEAGUE_BONUS_ANSWERS), where('uid', '==', meUid));
    const unsub = onSnapshot(q, (snap) => {
      const map = {};
      snap.docs.forEach((d) => { const a = d.data(); if (a.leagueId === leagueId) map[a.questionId] = a.answer; });
      setMyAnswers(map);
    }, () => setMyAnswers({}));
    return unsub;
  }, [meUid, leagueId]);

  // Alle svar til point-beregning + afsløring. Reglerne tillader at læse andres
  // svar efter deadline (alle) eller altid (manager) — så managere henter alle
  // spørgsmål, mens menige kun henter de låste.
  const loadQids = useMemo(() => {
    const now = Date.now();
    return questions
      .filter((q) => isManager || toMillis(q.deadline) <= now)
      .map((q) => q.id);
  }, [questions, isManager]);
  const pastKey = loadQids.join(',');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = {};
      for (const qid of loadQids) {
        try {
          const snap = await getDocs(query(
            collection(db, COL.LEAGUE_BONUS_ANSWERS),
            where('questionId', '==', qid),
          ));
          result[qid] = snap.docs.map((d) => d.data());
        } catch {
          result[qid] = [];
        }
      }
      if (!cancelled) setOthersByQid(result);
    }
    if (loadQids.length) load(); else setOthersByQid({});
    return () => { cancelled = true; };
  }, [pastKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Point pr. uid (kun fra spørgsmål hvis deadline er passeret og facit sat)
  const pointsByUid = useMemo(() => {
    const qById = Object.fromEntries(questions.map((q) => [q.id, q]));
    const totals = {};
    for (const [qid, answers] of Object.entries(othersByQid)) {
      const q = qById[qid];
      if (!q || q.facit == null || q.facit === '') continue;
      for (const a of answers) {
        totals[a.uid] = (totals[a.uid] || 0) + scoreLeagueBonus(q, a.answer);
      }
    }
    return totals;
  }, [othersByQid, questions]);

  return { questions, myAnswers, pointsByUid, answersByQid: othersByQid, loading };
}
