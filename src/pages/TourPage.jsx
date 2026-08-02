// ---------------------------------------------------------------------------
// TourPage (/tour) – samlet Tour-status: trøjeførere, fulde stillinger pr.
// konkurrence (samlet/sprint/bjerg/ungdom/hold) og seneste etaperesultat.
// Data kommer fra config/classifications, som sync-funktionen skriver efter
// hver afgjorte etape.
// ---------------------------------------------------------------------------
import { useMemo, useState } from 'react';
import Hero from '../components/Hero';
import TeamBadge from '../components/TeamBadge';
import { JerseyIcon } from '../data/jerseyAvatars';
import { riderFlag } from '../data/uciRanking2026';
import { useAuth } from '../context/AuthContext';
import { useClassifications } from '../features/tour/useClassifications';
import StandingsTable from '../features/tour/StandingsTable';
import GameCompetitions from '../features/tour/GameCompetitions';
import { useMyStageBets } from '../features/stages/useMyStageBets';
import { useActiveSeason } from '../features/stages/useActiveSeason';
import { useTourSettings } from '../features/stages/useTourSettings';
import { useLeagues } from '../features/leagues/useLeagues';
import { collectVisibleUids } from '../features/leaderboard/standingsUtils';
import { collectTippedTeams } from '../features/tour/tippedTeams';
import { useLeagueTippedTeams } from '../features/tour/useLeagueTippedTeams';
import { isDanishRider, prettyRiderName } from '../data/ridersTdf2026';
import TourRiderSearch from '../features/tour/TourRiderSearch';

const EMPTY_SET = new Set();

// De fem konkurrencer med visnings-metadata (titel, trøjefarve-accent, værditype).
const COMPS = [
  { key: 'samlet', title: 'Samlet', sub: 'gul trøje', jersey: 'yellow', valueType: 'time', accent: '#e8b800' },
  { key: 'sprint', title: 'Point', sub: 'grøn trøje', jersey: 'green', valueType: 'points', accent: '#1f9d55' },
  { key: 'bjerg', title: 'Bjerg', sub: 'prikket trøje', jersey: 'polka', valueType: 'points', accent: '#c0392b' },
  { key: 'ungdom', title: 'Ungdom', sub: 'hvid trøje', jersey: 'white', valueType: 'time', accent: '#9aa0a6' },
  { key: 'hold', title: 'Holdkonkurrence', sub: 'hurtigste hold', jersey: null, valueType: 'time', teamsMode: true, accent: 'var(--c-pitch)' },
];

// Trøjeførere øverst (kort). Rytternavn fra `jerseys`, hold slås op i stillingen.
const JERSEY_CARDS = [
  { key: 'yellow', holderKey: 'yellow', std: 'samlet', label: 'Gul', sub: 'Samlet fører', accent: '#e8b800' },
  { key: 'green', holderKey: 'green', std: 'sprint', label: 'Grøn', sub: 'Pointfører', accent: '#1f9d55' },
  { key: 'polka', holderKey: 'polka', std: 'bjerg', label: 'Prikket', sub: 'Bjergfører', accent: '#c0392b' },
  { key: 'white', holderKey: 'white', std: 'ungdom', label: 'Hvid', sub: 'Bedste unge', accent: '#9aa0a6' },
];

function LeaderCard({ jersey, name, teamName, sub, accent }) {
  return (
    <div
      data-testid="jersey-card"
      className="card"
      style={{ padding: '0.7rem 0.8rem', borderTop: `4px solid ${accent}`, display: 'flex', alignItems: 'center', gap: '0.6rem' }}
    >
      {jersey ? <JerseyIcon kind={jersey} size={30} title={sub} /> : <span style={{ fontSize: 26 }} aria-hidden>🏆</span>}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--c-muted)' }}>{sub}</div>
        <div style={{ fontWeight: 800, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name || '—'}
        </div>
        {teamName && <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)' }}><TeamBadge name={teamName} size={14} /></div>}
      </div>
    </div>
  );
}

export default function TourPage() {
  const { data, loading } = useClassifications();
  const { user } = useAuth();
  const season = useActiveSeason();
  const { gcTopN } = useTourSettings();

  // Fremhævning: hold tippet af dig eller din liga — eller slået helt fra.
  const [mode, setMode] = useState('mine');
  const { betsByStage } = useMyStageBets(user?.uid ?? null, season);
  const { leagues } = useLeagues(user?.uid ?? null);
  const visibleUids = useMemo(() => new Set(collectVisibleUids(leagues, user?.uid)), [leagues, user?.uid]);
  const mineTeams = useMemo(() => collectTippedTeams(Object.values(betsByStage || {})), [betsByStage]);
  const ligaTeams = useLeagueTippedTeams({ afterStage: data?.afterStage, season, memberUids: visibleUids });
  const highlightTeams = mode === 'liga' ? ligaTeams : (mode === 'mine' ? mineTeams : EMPTY_SET);

  const standings = data?.standings || {};
  const jerseys = data?.jerseys || {};
  const isPrev = data?.previousYear === true;
  const prevYear = (data?.season || season) - 1;
  const teamOf = (stdKey, rider) => (standings[stdKey] || []).find((r) => r.rider === rider)?.team || null;

  return (
    <div className="page" style={{ paddingBottom: '2rem' }}>
      <Hero
        title="Tour"
        subtitle="Stillingen i alle Tour de France-konkurrencer — samlet, point, bjerg, ungdom og hold."
        chips={isPrev
          ? [`📅 Sidste års Tour (${prevYear})`]
          : (data?.afterStage ? [`Efter etape ${data.afterStage}`] : ['Afventer løbsstart'])}
      />

      {isPrev && (
        <div
          data-testid="previous-year-banner"
          style={{
            marginTop: '0.75rem', padding: '0.7rem 0.9rem', borderRadius: 12,
            background: '#fff4e0', border: '1px solid #f0c674', color: '#7a4b00',
            fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}
        >
          <span aria-hidden style={{ fontSize: '1.1rem' }}>⚠️</span>
          <span>
            Dette er <strong>sidste års resultater (Tour de France {prevYear})</strong> — vist som forsmag.
            Stillingen nulstilles automatisk, når årets Tour går i gang.
          </span>
        </div>
      )}

      {loading ? (
        <div className="spinner" role="status" aria-label="Indlæser" style={{ marginTop: '1rem' }} />
      ) : !data ? (
        <div className="card" data-testid="tour-empty" style={{ marginTop: '0.75rem', textAlign: 'center' }}>
          <p style={{ margin: 0, color: 'var(--c-muted)' }}>
            Stillingerne vises her, så snart løbet er i gang og den første etape er afgjort. 🚴
          </p>
        </div>
      ) : (
        <>
          {/* Trøjeførere */}
          <section style={{ marginTop: '0.75rem' }} data-testid="jersey-leaders">
            <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {JERSEY_CARDS.map((j) => (
                <LeaderCard
                  key={j.key}
                  jersey={j.key}
                  name={prettyRiderName(jerseys[j.holderKey] || standings[j.std]?.[0]?.rider)}
                  teamName={teamOf(j.std, jerseys[j.holderKey] || standings[j.std]?.[0]?.rider)}
                  sub={j.sub}
                  accent={j.accent}
                />
              ))}
              <LeaderCard
                jersey={null}
                name={jerseys.teamLead || standings.hold?.[0]?.team}
                sub="Holdkonkurrence"
                accent="var(--c-pitch)"
              />
            </div>
          </section>

          {/* Søg en rytter i ALLE stillinger på én gang */}
          <TourRiderSearch standings={standings} stageResult={data.stageResult} />

          {/* Fremhævning: dine/ligaens tippede hold — eller ingen fremhævning */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--c-muted)' }}>⭐ Fremhæv tippede hold:</span>
            {[{ k: 'mine', label: 'Mine' }, { k: 'liga', label: 'Ligaen' }, { k: 'ingen', label: 'Ingen' }].map((m) => (
              <button
                key={m.k}
                type="button"
                onClick={() => setMode(m.k)}
                data-testid={`highlight-${m.k}`}
                className={`btn btn--sm ${mode === m.k ? '' : 'btn--ghost'}`}
              >
                {m.label}
              </button>
            ))}
            {mode !== 'ingen' && (
              <span style={{ fontSize: '0.76rem', color: 'var(--c-muted)' }}>
                ({highlightTeams.size} hold)
              </span>
            )}
          </div>

          {/* Spillets fire konkurrencer (top-5 hold + rytter-specifikation) */}
          <h3 style={{ margin: '1rem 0 0.1rem' }}>🎮 Spillets konkurrencer</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--c-muted)', margin: '0 0 0.5rem' }}>
            Sådan faldt de fire ting du tipper ud{data.afterStage ? ` på etape ${data.afterStage}` : ''} —
            point er dét holdet tog PÅ etapen (ikke sæsontotal). Trøje-klassementerne nedenfor er de kumulative.
          </p>
          <GameCompetitions data={data} gcTopN={gcTopN} highlightTeams={highlightTeams} />

          {/* Officielle klassementer */}
          <h3 style={{ margin: '1.25rem 0 0.5rem' }}>📊 Officielle klassementer</h3>
          <section style={{ marginTop: '0', display: 'grid', gap: '0.75rem' }}>
            {COMPS.map((c) => (
              <div key={c.key} className="card" data-testid={`standings-${c.key}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  {c.jersey ? <JerseyIcon kind={c.jersey} size={20} /> : <span aria-hidden>🏆</span>}
                  <strong style={{ fontSize: '1.02rem' }}>{c.title}</strong>
                  <span style={{ fontSize: '0.78rem', color: 'var(--c-muted)' }}>· {c.sub}</span>
                </div>
                <StandingsTable
                  rows={standings[c.key]}
                  valueType={c.valueType}
                  teamsMode={!!c.teamsMode}
                  accent={c.accent}
                  flagFor={c.teamsMode ? null : riderFlag}
                  danishFor={c.teamsMode ? null : isDanishRider}
                  riderNameFor={c.teamsMode ? null : prettyRiderName}
                  highlightTeams={highlightTeams}
                />
              </div>
            ))}
          </section>

          {/* Seneste etaperesultat */}
          {Array.isArray(data.stageResult) && data.stageResult.length > 0 && (
            <section style={{ marginTop: '1rem' }} data-testid="latest-stage-result">
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span aria-hidden>🏁</span>
                  <strong style={{ fontSize: '1.02rem' }}>Seneste etaperesultat</strong>
                  {data.afterStage && <span style={{ fontSize: '0.78rem', color: 'var(--c-muted)' }}>· etape {data.afterStage}</span>}
                </div>
                <StandingsTable rows={data.stageResult} valueType="time" flagFor={riderFlag} danishFor={isDanishRider} riderNameFor={prettyRiderName} highlightTeams={highlightTeams} />
              </div>
            </section>
          )}

          <p style={{ fontSize: '0.74rem', color: 'var(--c-muted)', marginTop: '0.75rem' }}>
            Data hentes automatisk fra ProCyclingStats efter hver etape.
          </p>
        </>
      )}
    </div>
  );
}
