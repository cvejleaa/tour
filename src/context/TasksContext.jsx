/**
 * TasksContext — samler brugerens udestående opgaver ét sted:
 *  - utippede/ufuldstændige etaper (åbne etaper uden komplet hold-tip)
 *  - åbne, ubesvarede globale bonusspørgsmål
 *  - åbne, ubesvarede liga-bonusspørgsmål (på tværs af alle ligaer)
 *
 * Beregnes én gang (provider mountes globalt for godkendte brugere) og deles
 * af både nav-badget og forsidens "Mine opgaver"-kort.
 */
import { createContext, useContext, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useStages } from '../features/stages/useStages';
import { useMyStageBets } from '../features/stages/useMyStageBets';
import { useActiveSeason } from '../features/stages/useActiveSeason';
import { useBonusQuestions, useMyBonusBets } from '../features/bonus/useBonusData';
import { useLeagues } from '../features/leagues/useLeagues';
import { useLeagueBonusTasks } from '../features/dashboard/useLeagueBonusTasks';
import { countOpenUnansweredBonus } from '../features/dashboard/dashboardTasks';
import { countUntippedOpenStages } from '../features/dashboard/dashboardStats';

const DEFAULT = {
  stageCount: 0,
  bonusCount: 0,
  leagueBonus: { total: 0, byLeague: [] },
  total: 0,
  loading: false,
};

const TasksContext = createContext(DEFAULT);

// Indre provider: kører kun når brugeren er godkendt (så hooks ikke abonnerer
// på data, reglerne ville afvise for ikke-godkendte).
function ApprovedTasksProvider({ uid, children }) {
  const season = useActiveSeason();
  const { stages } = useStages(season);
  const { betsByStage } = useMyStageBets(uid, season);
  const { questions: bonusQuestions } = useBonusQuestions();
  const { bonusBets } = useMyBonusBets(uid);
  const { leagues } = useLeagues(uid);
  const { byLeague, total: leagueBonusTotal } = useLeagueBonusTasks(leagues, uid);

  const value = useMemo(() => {
    const stageCount = countUntippedOpenStages(stages, betsByStage);
    const bonusCount = countOpenUnansweredBonus(bonusQuestions, (id) => bonusBets.has(id));
    return {
      stageCount,
      bonusCount,
      leagueBonus: { total: leagueBonusTotal, byLeague },
      total: stageCount + bonusCount + leagueBonusTotal,
      loading: false,
    };
  }, [stages, betsByStage, bonusQuestions, bonusBets, byLeague, leagueBonusTotal]);

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
