// ---------------------------------------------------------------------------
// StagesPage – etapeoversigt med hold-tip (de fire spørgsmål pr. etape).
// Falder tilbage til 2026-placeholder-ruten indtil sync'en har seedet etaper.
// ---------------------------------------------------------------------------
import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Hero from '../components/Hero';
import { useStages } from '../features/stages/useStages';
import { useTeams } from '../features/stages/useTeams';
import { useMyStageBets } from '../features/stages/useMyStageBets';
import { useActiveSeason } from '../features/stages/useActiveSeason';
import { useTourSettings } from '../features/stages/useTourSettings';
import { stageStatus } from '../lib/tourStages';
import { placeholderRoute2026 } from '../data/route2026';
import StageCard from '../features/stages/StageCard';
import ClassementsCard from '../features/stages/ClassementsCard';
import { applyPicksToOpenStages } from '../features/stages/applyPicksToOpenStages';
import { previousPicksFor } from '../features/stages/previousPicks';
import { similarStagesFor } from '../features/stages/similarPicks';

const FILTERS = [
  { key: 'kommende', label: 'Kommende' },
  { key: 'utippede', label: 'Mangler tip' },
  { key: 'alle', label: 'Alle' },
];

export default function StagesPage() {
  const { user } = useAuth();
  const uid = user?.uid;
  const season = useActiveSeason();
  const { points, gcTopN } = useTourSettings();
  const { stages: dbStages } = useStages(season);
  const { teams } = useTeams(season);
  const { betsByStage } = useMyStageBets(uid, season);
  const [filter, setFilter] = useState('kommende');

  // Brug rigtige etaper hvis de findes, ellers placeholder-ruten for sæsonen.
  const stages = dbStages.length ? dbStages : placeholderRoute2026(season);

  // Trøjer = seneste afgjorte etapes jerseys (udledt af de indlæste etaper).
  const latestDone = useMemo(
    () => [...stages].filter((s) => s.status === 'done')
      .sort((a, b) => b.number - a.number)[0] || null,
    [stages],
  );

  const shown = useMemo(() => {
    if (filter === 'alle') return stages;
    if (filter === 'utippede') {
      return stages.filter((s) => stageStatus(s, Date.now()) === 'scheduled'
        && !betsByStage[s.id]?.winnerTeam);
    }
    // kommende = ikke-afgjorte (åbne + låste uden resultat)
    return stages.filter((s) => stageStatus(s, Date.now()) !== 'done');
  }, [stages, filter, betsByStage]);

  const tippedCount = stages.filter((s) => betsByStage[s.id]?.winnerTeam).length;

  // Anvend ét sæt holdvalg på alle åbne etaper (batched). Stages-listen ligger
  // her, så batchen kører over den fulde rute.
  const applyToOpen = (picks) => applyPicksToOpenStages(uid, picks, stages);

  return (
    <div className="page" style={{ paddingBottom: '2rem' }}>
      <Hero
        title="Etaper"
        subtitle="Tip på holdene: hvem vinder etapen, hvem kører bedst, og hvem tager bjerg- og sprintpoint."
        chips={[`Sæson ${season}`, `${tippedCount} tippet`, 'Dansk tid']}
      />

      <ClassementsCard jerseys={latestDone?.jerseys} afterStage={latestDone?.number} />

      {dbStages.length === 0 && (
        <p className="card" style={{ fontSize: '0.85rem', color: 'var(--c-muted)', borderLeft: '4px solid var(--c-warn)' }}>
          Foreløbig 2026-rute vises (datoer/typer er ikke endelige). De rigtige
          etaper og resultater kommer automatisk ind, så snart Touren kører.
        </p>
      )}

      <div style={{ display: 'flex', gap: '0.4rem', margin: '0.75rem 0', flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`btn btn--sm ${filter === f.key ? '' : 'btn--ghost'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p style={{ color: 'var(--c-muted)' }}>Ingen etaper i dette filter.</p>
      ) : (
        shown.map((stage) => (
          <StageCard
            key={stage.id}
            stage={stage}
            uid={uid}
            bet={betsByStage[stage.id] || null}
            teams={teams}
            points={points}
            gcTopN={gcTopN}
            previousPicks={previousPicksFor(stage, stages, betsByStage)}
            similarStages={similarStagesFor(stage, stages, betsByStage)}
            onApplyToOpenStages={applyToOpen}
          />
        ))
      )}
    </div>
  );
}
