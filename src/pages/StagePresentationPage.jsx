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
import { useTourSettings } from '../features/stages/useTourSettings';
import StageAnswers from '../features/stages/StageAnswers';
import StandingsTable from '../features/tour/StandingsTable';
import { riderFlag } from '../data/uciRanking2026';
import { isDanishRider, prettyRiderName } from '../data/ridersTdf2026';
import { placeholderRoute2026 } from '../data/route2026';
import { activeQuestionsForStage } from '../lib/tourScoring';
import { stageStatus } from '../lib/tourStages';

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

// Farve pr. bjergkategori (HC hårdest → kat. 4 lettest).
const CAT_COLOR = {
  HC: '#8b1a1a', 1: '#c0392b', 2: '#e67e22', 3: '#3a8a3a', 4: '#6b7a8f',
};

function ClimbBadge({ category }) {
  const cat = String(category ?? '');
  return (
    <span
      style={{
        display: 'inline-block', minWidth: 28, textAlign: 'center',
        background: CAT_COLOR[cat] || 'var(--c-muted)', color: '#fff',
        borderRadius: 6, padding: '0.1rem 0.4rem', fontSize: '0.74rem', fontWeight: 800,
      }}
    >
      {cat || '?'}
    </span>
  );
}

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
  const { points, gcTopN } = useTourSettings();

  const num = Number(number);

  // Den statiske rute bærer de uforanderlige præsentations-felter (profil,
  // stigninger, sprints), så de virker uanset om etapen er seedet i Firestore.
  const staticStage = useMemo(
    () => placeholderRoute2026(season).find((s) => Number(s.number) === num) || null,
    [season, num],
  );

  // Brug seedet etape hvis den findes, ellers fald tilbage til ruten, så
  // siden virker både før og efter seeding.
  const stage = useMemo(() => {
    const fromDb = dbStages.find((s) => Number(s.number) === num);
    return fromDb || staticStage;
  }, [dbStages, num, staticStage]);

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
  const status = stageStatus(stage, Date.now());
  const isDone = status === 'done';
  // Fra etapestart (låst) må alle se hinandens tips — reglerne åbner læsning
  // ved kickoff, så visningen skal ikke vente på facit.
  const showAnswers = status === 'locked' || isDone;

  // Præsentations-felter: foretræk seedet værdi, ellers den statiske rute.
  const profileImage = stage.profileImage || staticStage?.profileImage || null;
  const elevation = stage.elevation ?? staticStage?.elevation ?? null;
  const climbs = (stage.climbs?.length ? stage.climbs : staticStage?.climbs) || [];
  const sprints = (stage.sprints?.length ? stage.sprints : staticStage?.sprints) || [];
  // Foretræk den statiske rutes beskrivelse (oversat til dansk) frem for et
  // ældre seedet engelsk dokument.
  const description = staticStage?.description || stage.description || '';

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
          {elevation != null && (
            <StatTile label="Højdemeter" value={`${elevation} m`} />
          )}
        </div>

        {/* Højdeprofil fra letour – den mest fortællende grafik om etapen. */}
        {profileImage && (
          <figure style={{ margin: '0 0 1rem' }} data-testid="stage-profile">
            <img
              src={profileImage}
              alt={`Højdeprofil for etape ${stage.number}`}
              loading="lazy"
              style={{ maxWidth: '100%', height: 'auto', borderRadius: 12, display: 'block' }}
            />
            <figcaption style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: 'var(--c-muted)' }}>
              Højdeprofil
            </figcaption>
          </figure>
        )}

        {/* Stigninger + mellemsprints – parcoursens udfordringer. */}
        {(climbs.length > 0 || sprints.length > 0) && (
          <section style={{ marginBottom: '1rem' }} data-testid="stage-challenges">
            <h3 style={{ marginBottom: '0.5rem' }}>Dagens udfordringer</h3>
            {climbs.length > 0 && (
              <div style={{ marginBottom: sprints.length ? '0.6rem' : 0 }}>
                <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--c-muted)', marginBottom: '0.3rem' }}>
                  ⛰️ Kategoriserede stigninger
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.3rem' }}>
                  {climbs.map((c, i) => (
                    <li key={`${c.name}-${i}`} data-testid="climb-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                      <ClimbBadge category={c.category} />
                      <span>{c.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {sprints.length > 0 && (
              <div>
                <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--c-muted)', marginBottom: '0.3rem' }}>
                  🚀 Mellemsprint
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {sprints.map((s, i) => (
                    <span key={`${s.name}-${i}`} data-testid="sprint-chip" className="badge badge--muted" style={{ fontSize: '0.82rem' }}>
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

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
        {description && (
          <section style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: '0.4rem' }}>
              Om mål-byen {stage.finishCity ?? ''}
            </h3>
            <p style={{ margin: 0, lineHeight: 1.5, color: 'var(--c-muted)' }}>
              {description}
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

        {/* Etapens fulde målrækkefølge — når resultatet er gemt af synken.
            (Ældre afgjorte etaper selv-opheles af næste sync-kørsel.) */}
        {isDone && Array.isArray(stage.resultRows) && stage.resultRows.length > 0 && (
          <section style={{ marginBottom: '1rem' }} data-testid="stage-finish-order">
            <h3 style={{ marginBottom: '0.4rem' }}>🏁 Etapens resultat</h3>
            <StandingsTable
              rows={stage.resultRows}
              valueType="time"
              flagFor={riderFlag}
              danishFor={isDanishRider}
              riderNameFor={prettyRiderName}
            />
          </section>
        )}

        {/* Bjerg-/sprintpoint PÅ etapen + holdkonkurrencen efter etapen —
            de resultater Q2-Q4 afgøres på. Kun blokke med data vises (en
            holdtidskørsel har fx hverken bjerg- eller sprintpoint). */}
        {isDone && (stage.mountainRows?.length > 0 || stage.sprintRows?.length > 0 || stage.holdRows?.length > 0) && (
          <section style={{ marginBottom: '1rem' }} data-testid="stage-class-results">
            <div style={{ display: 'grid', gap: '0.9rem', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              {stage.mountainRows?.length > 0 && (
                <div data-testid="stage-mountain-result">
                  <h3 style={{ margin: '0 0 0.4rem' }}>⛰️ Bjergpoint på etapen</h3>
                  <StandingsTable
                    rows={stage.mountainRows}
                    valueType="points"
                    topN={5}
                    flagFor={riderFlag}
                    danishFor={isDanishRider}
                    riderNameFor={prettyRiderName}
                  />
                </div>
              )}
              {stage.sprintRows?.length > 0 && (
                <div data-testid="stage-sprint-result">
                  <h3 style={{ margin: '0 0 0.4rem' }}>🚀 Sprintpoint på etapen</h3>
                  <StandingsTable
                    rows={stage.sprintRows}
                    valueType="points"
                    topN={5}
                    flagFor={riderFlag}
                    danishFor={isDanishRider}
                    riderNameFor={prettyRiderName}
                  />
                </div>
              )}
              {stage.holdRows?.length > 0 && (
                <div data-testid="stage-team-result">
                  <h3 style={{ margin: '0 0 0.4rem' }}>👥 Holdkonkurrencen efter etapen</h3>
                  <StandingsTable rows={stage.holdRows} valueType="time" teamsMode topN={5} />
                </div>
              )}
            </div>
          </section>
        )}

        {/* Alles tips fra etapestart; facit + etapens top kommer til, når
            resultatet lander. */}
        {showAnswers && (
          <section style={{ marginBottom: '1rem' }} data-testid="stage-results">
            <h3 style={{ marginBottom: '0.4rem' }}>{isDone ? 'Resultat & alles tips' : 'Alles tips (etapen er i gang)'}</h3>
            <StageAnswers stage={stage} points={points} gcTopN={gcTopN} />
          </section>
        )}

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
