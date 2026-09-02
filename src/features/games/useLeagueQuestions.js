/**
 * Hook: useLeagueQuestions(gameId, leagueId) — live liga-spørgsmål + de svar
 * man må se (svar-doc-id = qId_uid).
 *
 * Andres svar er først læsbare, når spørgsmålet er lukket (facit sat eller
 * deadline passeret) — ellers kunne man kigge de andre i kortene. Det håndhæves
 * i security rules, og fordi regler ikke er filtre, SKAL forespørgslerne her
 * matche reglen: ét abonnement på egne svar og ét pr. gruppe af lukkede
 * spørgsmål. En bredere forespørgsel ville blive afvist i sin helhed.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  collection, onSnapshot, query, orderBy, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { COL } from '../../lib/constants';

// 'in' tager højst 30 værdier pr. forespørgsel.
const IN_CHUNK = 30;
// Klientens ur kan gå en anelse forud for serverens. Venter vi et øjeblik med
// at spørge efter et netop lukket spørgsmål, undgår vi at hele forespørgslen
// afvises, fordi serveren endnu ikke synes deadline er passeret.
const CLOCK_SKEW_MS = 60_000;

/** Spørgsmål hvor andres svar må vises: facit sat, eller deadline passeret. */
export function settledQuestionIds(questions, nowMs) {
  return (questions || [])
    .filter((q) => q.facit != null
      || (q.deadline != null && Number(q.deadline) + CLOCK_SKEW_MS <= nowMs))
    .map((q) => q.id);
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function useLeagueQuestions(gameId, leagueId) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [questions, setQuestions] = useState([]);
  const [mine, setMine] = useState([]);
  const [others, setOthers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Spørgsmålene.
  useEffect(() => {
    if (!gameId || !leagueId) { setQuestions([]); setLoading(false); return undefined; }
    setLoading(true);
    const qRef = query(
      collection(db, COL.GAMES, gameId, COL.GAME_LEAGUES, leagueId, COL.GAME_LEAGUE_QUESTIONS),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(qRef, (snap) => {
      setQuestions(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      setLoading(false);
    }, () => setLoading(false));
  }, [gameId, leagueId]);

  // Egne svar — altid læsbare.
  useEffect(() => {
    if (!gameId || !leagueId || !uid) { setMine([]); return undefined; }
    const aRef = query(
      collection(db, COL.GAMES, gameId, COL.GAME_LEAGUES, leagueId, COL.GAME_LEAGUE_QUESTION_ANSWERS),
      where('uid', '==', uid),
    );
    return onSnapshot(aRef, (snap) => {
      setMine(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    }, (err) => console.error('useLeagueQuestions (egne svar) fejl:', err));
  }, [gameId, leagueId, uid]);

  // Andres svar på lukkede spørgsmål.
  const settledIds = useMemo(
    () => settledQuestionIds(questions, Date.now()),
    [questions],
  );
  const settledKey = settledIds.join(',');

  useEffect(() => {
    if (!gameId || !leagueId || settledIds.length === 0) { setOthers([]); return undefined; }
    const groups = chunk(settledIds, IN_CHUNK);
    const byGroup = groups.map(() => []);
    const unsubs = groups.map((ids, i) => onSnapshot(
      query(
        collection(db, COL.GAMES, gameId, COL.GAME_LEAGUES, leagueId, COL.GAME_LEAGUE_QUESTION_ANSWERS),
        where('questionId', 'in', ids),
      ),
      (snap) => {
        byGroup[i] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
        setOthers(byGroup.flat());
      },
      (err) => console.error('useLeagueQuestions (svar) fejl:', err),
    ));
    return () => unsubs.forEach((u) => u());
    // settledKey holder effekten stabil, selvom array-referencen skifter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, leagueId, settledKey]);

  // qId → [{uid, answer}] (egne og andres flettet, uden dubletter)
  const answersByQid = useMemo(() => {
    const byId = new Map();
    for (const a of [...others, ...mine]) byId.set(a.id, a);
    const m = {};
    for (const a of byId.values()) {
      if (!a.questionId) continue;
      (m[a.questionId] = m[a.questionId] || []).push(a);
    }
    return m;
  }, [mine, others]);

  return { questions, answersByQid, loading };
}
