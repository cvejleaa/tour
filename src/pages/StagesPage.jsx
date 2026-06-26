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
import { stageStatus } from '../lib/tourStages';
import { placeholderRoute2026 } from '../data/route2026';
import StageCard from '../features/stages/StageCard';

const FILTERS = [
  { key: 'kommende', label: 'Kommende' },
  { key: 'utippede', label: 'Mangler tip' },
  { key: 'alle', label: 'Alle' },
];

export default function StagesPage() {
  const { user } = useAuth();
  const uid = user?.uid;
  const { stages: dbStages } = useStages();
  const { teams } = useTeams();
  const { betsByStage } = useMyStageBets(uid);
  const [filter, setFilter] = useState('kommende');

  // Brug rigtige etaper hvis de findes, ellers placeholder-ruten.
  const stages = dbStages.length ? dbStages : placeholderRoute2026();

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

  return (
    <div className="page" style={{ paddingBottom: '2rem' }}>
      <Hero
        title="Etaper"
        subtitle="Tip på holdene: hvem vinder etapen, hvem kører bedst, og hvem tager bjerg- og sprintpoint."
        chips={[`${stages.length} etaper`, `${tippedCount} tippet`, 'Dansk tid']}
      />

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
          />
        ))
      )}
    </div>
  );
}
