/**
 * Hook: useDailyStandings
 * Beregner point pr. spiller fra de kampe, der er 'finished' med kickoff i dag (CPH-tid).
 *
 * Strategi: hent alle matches (onSnapshot) + alle bets for dagens kampe.
 * Summér point lokalt vha. computeDailyPoints fra standingsUtils.
 *
 * Alternativ (hvis datamængden bliver for stor):
 *   Cloud Functions kan vedligeholde et dagligt aggregat i Firestore (standings/daily),
 *   og klienten læser blot det dokument med onSnapshot. For nu bruges klient-beregning.
 */
import { useEffect, useState, useMemo } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { COL, MATCH_STATUS, TIMEZONE } from '../../lib/constants';
import { computeDailyPoints, getTodayInCPH } from './standingsUtils';

/**
 * @returns {{
 *   pointsByUid: Record<string, number>,
 *   todayStr:    string,
 *   loading:     boolean,
 *   error:       string|null,
 * }}
 */
export function useDailyStandings() {
  const todayStr = useMemo(() => getTodayInCPH(), []);

  const [matches, setMatches] = useState([]);
  const [bets, setBets] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [loadingBets, setLoadingBets] = useState(true);
  const [error, setError] = useState(null);

  // Abonnér på alle finished kampe
  useEffect(() => {
    const q = query(
      collection(db, COL.MATCHES),
      where('status', '==', MATCH_STATUS.FINISHED),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoadingMatches(false);
      },
      (err) => {
        console.error('useDailyStandings matches fejl:', err);
        setError('Kunne ikke hente dagens kampe.');
        setLoadingMatches(false);
      },
    );

    return unsub;
  }, []);

  // Find id'er på dagens finished kampe og hent deres bets
  const todayMatchIds = useMemo(() => {
    return matches
      .filter((m) => {
        const kickoff = m.kickoff?.toDate ? m.kickoff.toDate() : new Date(m.kickoff);
        return kickoff.toLocaleDateString('sv-SE', { timeZone: TIMEZONE }) === todayStr;
      })
      .map((m) => m.id);
  }, [matches, todayStr]);

  useEffect(() => {
    if (loadingMatches) return;   // Vent til matches er indlæst
    if (todayMatchIds.length === 0) {
      setBets([]);
      setLoadingBets(false);
      return;
    }

    // Firestore 'in'-query maks 30 elementer; del op om nødvendigt
    // (VM har max ~104 kampe, men 'in' er kun nødvendig for dagens kampe)
    const chunks = [];
    for (let i = 0; i < todayMatchIds.length; i += 30) {
      chunks.push(todayMatchIds.slice(i, i + 30));
    }

    let allBets = [];
    let pending = chunks.length;

    if (pending === 0) {
      setBets([]);
      setLoadingBets(false);
      return;
    }

    const unsubFns = chunks.map((chunk) => {
      const q = query(
        collection(db, COL.BETS),
        where('matchId', 'in', chunk),
      );
      return onSnapshot(
        q,
        (snap) => {
          // Opdatér bets fra denne chunk
          const chunkBets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          allBets = [...allBets.filter((b) => !chunk.includes(b.matchId)), ...chunkBets];
          setBets([...allBets]);
          pending -= 1;
          if (pending <= 0) setLoadingBets(false);
        },
        (err) => {
          console.error('useDailyStandings bets fejl:', err);
          setError('Kunne ikke hente bets.');
          setLoadingBets(false);
        },
      );
    });

    return () => unsubFns.forEach((unsub) => unsub());
  }, [todayMatchIds, loadingMatches]);

  // Beregn point pr. uid
  const pointsByUid = useMemo(() => {
    if (loadingMatches || loadingBets) return {};
    return computeDailyPoints(matches, bets, todayStr);
  }, [matches, bets, todayStr, loadingMatches, loadingBets]);

  return {
    pointsByUid,
    todayStr,
    loading: loadingMatches || loadingBets,
    error,
  };
}
