/**
 * Hook: useLeagueBonusTasks — tæller åbne, ubesvarede liga-bonusspørgsmål
 * på tværs af ALLE brugerens ligaer, så forsiden kan vise ét samlet overblik.
 *
 * Henter spørgsmål for brugerens ligaer + brugerens egne svar (live), og
 * udregner antal mangler pr. liga.
 */
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { countOpenLeagueBonus } from './dashboardTasks';

// Firestore 'in' tillader op til 30 værdier; ligaer pr. bruger er typisk få.
const IN_LIMIT = 30;

/**
 * @param {Array<{id:string,name?:string}>} leagues – brugerens ligaer
 * @param {string|null} uid
 * @returns {{ byLeague: Array<{leagueId:string,name:string,count:number}>, total:number, loading:boolean }}
 */
export function useLeagueBonusTasks(leagues, uid) {
  const [questions, setQuestions] = useState([]); // alle liga-bonus-spørgsmål for brugerens ligaer
  const [answers, setAnswers] = useState({}); // qid -> svarets værdi (brugerens egne)
  const [loading, setLoading] = useState(true);

  const leagueIds = useMemo(
    () => (leagues ?? []).map((l) => l.id).filter(Boolean).slice(0, IN_LIMIT),
    [leagues],
  );
  const idsKey = leagueIds.join(',');

  // Spørgsmål for brugerens ligaer (live)
  useEffect(() => {
    if (leagueIds.length === 0) { setQuestions([]); setLoading(false); return undefined; }
    const q = query(collection(db, COL.LEAGUE_BONUS), where('leagueId', 'in', leagueIds));
    const unsub = onSnapshot(
      q,
      (snap) => { setQuestions(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false),
    );
    return unsub;
  }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Brugerens egne svar (live)
  useEffect(() => {
    if (!uid) { setAnswers({}); return undefined; }
    const q = query(collection(db, COL.LEAGUE_BONUS_ANSWERS), where('uid', '==', uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => { const a = d.data(); map[a.questionId] = a.answer; });
        setAnswers(map);
      },
      () => setAnswers({}),
    );
    return unsub;
  }, [uid]);

  // Mangler pr. liga
  const byLeague = useMemo(() => {
    const nameById = Object.fromEntries((leagues ?? []).map((l) => [l.id, l.name ?? 'Liga']));
    const qByLeague = {};
    for (const q of questions) {
      (qByLeague[q.leagueId] ??= []).push(q);
    }
    return Object.entries(qByLeague)
      .map(([leagueId, qs]) => ({
        leagueId,
        name: nameById[leagueId] ?? 'Liga',
        count: countOpenLeagueBonus(qs, answers),
      }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [questions, answers, leagues]);

  const total = useMemo(() => byLeague.reduce((s, r) => s + r.count, 0), [byLeague]);

  return { byLeague, total, loading };
}
