/**
 * Hook: useLeagueQuestions(gameId, leagueId) — live liga-spørgsmål + alle svar
 * i ligaen (svar-doc-id = qId_uid). Bruges kun når liga-kortet er åbent.
 */
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

export function useLeagueQuestions(gameId, leagueId) {
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameId || !leagueId) { setQuestions([]); setAnswers([]); setLoading(false); return undefined; }
    setLoading(true);
    const qRef = query(
      collection(db, COL.GAMES, gameId, COL.GAME_LEAGUES, leagueId, COL.GAME_LEAGUE_QUESTIONS),
      orderBy('createdAt', 'desc'),
    );
    const aRef = collection(db, COL.GAMES, gameId, COL.GAME_LEAGUES, leagueId, COL.GAME_LEAGUE_QUESTION_ANSWERS);
    const un1 = onSnapshot(qRef, (snap) => {
      setQuestions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    const un2 = onSnapshot(aRef, (snap) => {
      setAnswers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => { un1(); un2(); };
  }, [gameId, leagueId]);

  // qId → [{uid, answer}]
  const answersByQid = useMemo(() => {
    const m = {};
    for (const a of answers) {
      if (!a.questionId) continue;
      (m[a.questionId] = m[a.questionId] || []).push(a);
    }
    return m;
  }, [answers]);

  return { questions, answersByQid, loading };
}
