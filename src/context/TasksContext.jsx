/**
 * TasksContext — samler brugerens udestående opgaver ét sted:
 *  - utippede kampe
 *  - åbne, ubesvarede globale bonusspørgsmål
 *  - åbne, ubesvarede liga-bonusspørgsmål (på tværs af alle ligaer)
 *
 * Beregnes én gang (provider mountes globalt for godkendte brugere) og deles
 * af både nav-badget og forsidens "Mine opgaver"-kort.
 */
import { createContext, useContext, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useMatches } from '../features/matches/useMatches';
import { useMyBets } from '../features/matches/useMyBets';
import { useBonusQuestions, useMyBonusBets } from '../features/bonus/useBonusData';
import { useLeagues } from '../features/leagues/useLeagues';
import { useLeagueBonusTasks } from '../features/dashboard/useLeagueBonusTasks';
import { computeDashboard } from '../features/matches/dashboardUtils';
import { countOpenUnansweredBonus } from '../features/dashboard/dashboardTasks';

const DEFAULT = {
  matchCount: 0,
  bonusCount: 0,
  leagueBonus: { total: 0, byLeague: [] },
  total: 0,
  loading: false,
};

const TasksContext = createContext(DEFAULT);

// Indre provider: kører kun når brugeren er godkendt (så hooks ikke abonnerer
// på data, reglerne ville afvise for ikke-godkendte).
function ApprovedTasksProvider({ uid, children }) {
  const { matches } = useMatches();
  const { bets } = useMyBets(uid);
  const { questions: bonusQuestions } = useBonusQuestions();
  const { bonusBets } = useMyBonusBets(uid);
  const { leagues } = useLeagues(uid);
  const { byLeague, total: leagueBonusTotal } = useLeagueBonusTasks(leagues, uid);

  const value = useMemo(() => {
    const matchCount = computeDashboard(matches, bets).missingTotal;
    const bonusCount = countOpenUnansweredBonus(bonusQuestions, (id) => bonusBets.has(id));
    return {
      matchCount,
      bonusCount,
      leagueBonus: { total: leagueBonusTotal, byLeague },
      total: matchCount + bonusCount + leagueBonusTotal,
      loading: false,
    };
  }, [matches, bets, bonusQuestions, bonusBets, byLeague, leagueBonusTotal]);

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function TasksProvider({ children }) {
  const { user, isApproved } = useAuth();
  if (!isApproved || !user) {
    return <TasksContext.Provider value={DEFAULT}>{children}</TasksContext.Provider>;
  }
  return <ApprovedTasksProvider uid={user.uid}>{children}</ApprovedTasksProvider>;
}

export function useTasks() {
  return useContext(TasksContext);
}
