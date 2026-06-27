// ---------------------------------------------------------------------------
// StagePresentationPage – præsentationsside pr. etape (/etape/:number).
// Slår etapen op i de seedede etaper (useStages) og falder tilbage til
// placeholderRoute2026, så siden virker både før og efter seeding.
// Viser nøgletal, mål-by-billede, bytekst, aktive spørgsmål og (når til
// stede) højdemeter + ekspert-tip.
// ---------------------------------------------------------------------------
import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import Hero from '../components/Hero';
import { useStages } from '../features/stages/useStages';
import { useActiveSeason } from '../features/stages/useActiveSeason';
import { placeholderRoute2026 } from '../data/route2026';
import { activeQuestionsForStage } from '../lib/tourScoring';

const STAGE_TYPE_LABEL = {
  flat: '🟢 Flad', hilly: '🟡 Kuperet', mountain: '🔴 Bjerg',
  itt: '⏱️ Enkeltstart', ttt: '⏱️ Holdtidskørsel', unknown: 'Etape',
};

// De fire spørgsmål i fast rækkefølge med en kort dansk label.
const QUESTION_SUMMARY = [
  { key: 'winnerTeam', label: 'Etapevinderens hold' },
  { key: 'gcTeam', label: 'Bedste hold' },
  { key: 'mountainTeam', label: 'Bjergpoint' },
  { key: 'sprintTeam', label: 'Sprintpoint' },
];

// Lang dansk dato, fx "lørdag 4. juli". Bruger stage.date ("2026-07-04")
// hvis muligt, ellers kickoff.
function formatLongDate(stage) {
  const raw = stage?.date || stage?.kickoff;
  if (!raw) return '';
  const d = raw?.toDate ? raw.toDate() : new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' });
}

function StatTile({ label, value }) {
  return (
    <div
      data-testid="stat-tile"
      style={{
        background: 'var(--c-bg-alt, #f5f5f5)', borderRadius: 10,
        padding: '0.6rem 0.8rem', minWidth: 120, flex: '1 1 120px',
      }}
    >
      <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--c-muted)' }}>
        {label}
      </div>
      <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{value}</div>
    </div>
  );
}

export default function StagePresentationPage() {
  const { number } = useParams();
  const season = useActiveSeason();
  const { stages: dbStages } = useStages(season);

  const num = Number(number);

  // Brug seedet etape hvis den findes, ellers fald tilbage til ruten, så
  // siden virker både før og efter seeding.
  const stage = useMemo(() => {
    const fromDb = dbStages.find((s) => Number(s.number) === num);
    if (fromDb) return fromDb;
    return placeholderRoute2026(season).find((s) => Number(s.number) === num) || null;
  }, [dbStages, season, num]);

  if (!stage) {
    return (
      <div className="page" style={{ paddingBottom: '2rem' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <h2 style={{ marginTop: 0 }}>Etape ikke fundet</h2>
          <p style={{ color: 'var(--c-muted)' }}>
            Vi kunne ikke finde etape {number}.
          </p>
          <Link className="btn" to="/etaper">Tilbage til etaperne</Link>
        </div>
      </div>
    );
  }

  const typeLabel = STAGE_TYPE_LABEL[stage.type] || STAGE_TYPE_LABEL.unknown;
  const longDate = formatLongDate(stage);
  const active = activeQuestionsForStage(stage);

  return (
    <div className="page" style={{ paddingBottom: '2rem' }}>
      <Hero
        title={`Etape ${stage.number}`}
        subtitle={`${stage.startCity ?? ''} → ${stage.finishCity ?? ''}`}
        chips={[typeLabel, longDate].filter(Boolean)}
      />

      <div className="card" data-testid="stage-presentation">
        {/* Stor rute-linje */}
        <h2 style={{ marginTop: 0, marginBottom: '0.75rem' }} data-testid="route-line">
          {stage.startCity ?? '?'} → {stage.finishCity ?? '?'}
        </h2>

        {/* Nøgletal */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {stage.km != null && (
            <StatTile label="Distance" value={`${stage.km} km`} />
          )}
          {stage.startTime && (
            <StatTile label="Starttid" value={`${stage.startTime} (fransk/CEST tid)`} />
          )}
          <StatTile label="Type" value={typeLabel} />
          {stage.elevation != null && (
            <StatTile label="Højdemeter" value={`${stage.elevation} m`} />
          )}
        </div>

        {/* Mål-by-billede som banner */}
        {stage.image && (
          <figure style={{ margin: '0 0 1rem' }}>
            <img
              src={stage.image}
              alt={stage.finishCity || ''}
              loading="lazy"
              style={{ maxWidth: '100%', height: 'auto', borderRadius: 12, display: 'block' }}
            />
            {stage.finishCity && (
              <figcaption style={{ marginTop: '0.35rem', fontSize: '0.85rem', color: 'var(--c-muted)' }}>
                {stage.finishCity}
              </figcaption>
            )}
          </figure>
        )}

        {/* Om etapen / mål-byen */}
        {stage.description && (
          <section style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: '0.4rem' }}>
              Om mål-byen {stage.finishCity ?? ''}
            </h3>
            <p style={{ margin: 0, lineHeight: 1.5, color: 'var(--c-muted)' }}>
              {stage.description}
            </p>
          </section>
        )}

        {/* Aktive spørgsmål */}
        <section style={{ marginBottom: '1rem' }} data-testid="active-questions">
          <h3 style={{ marginBottom: '0.4rem' }}>Spørgsmål på denne etape</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.25rem' }}>
            {QUESTION_SUMMARY.map((q) => (
              <li key={q.key} data-testid={`question-${q.key}`} style={{ fontSize: '0.9rem' }}>
                {active[q.key] ? '✅' : '—'} {q.label}
              </li>
            ))}
          </ul>
        </section>

        {/* Ekspert-tip – kun når til stede */}
        {stage.expertTip && (
          <section style={{ marginBottom: '1rem' }} data-testid="expert-tip">
            <h3 style={{ marginBottom: '0.4rem' }}>💡 Ekspert-tip</h3>
            <p style={{ margin: 0, lineHeight: 1.5 }}>{stage.expertTip}</p>
          </section>
        )}

        <Link className="btn" to="/etaper" data-testid="tip-stage-btn">
          Tip denne etape
        </Link>
      </div>
    </div>
  );
}
