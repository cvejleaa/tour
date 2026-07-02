// ---------------------------------------------------------------------------
// TourPage (/tour) – samlet Tour-status: trøjeførere, fulde stillinger pr.
// konkurrence (samlet/sprint/bjerg/ungdom/hold) og seneste etaperesultat.
// Data kommer fra config/classifications, som sync-funktionen skriver efter
// hver afgjorte etape.
// ---------------------------------------------------------------------------
import Hero from '../components/Hero';
import TeamBadge from '../components/TeamBadge';
import { JerseyIcon } from '../data/jerseyAvatars';
import { useClassifications } from '../features/tour/useClassifications';
import StandingsTable from '../features/tour/StandingsTable';

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

  const standings = data?.standings || {};
  const jerseys = data?.jerseys || {};
  const teamOf = (stdKey, rider) => (standings[stdKey] || []).find((r) => r.rider === rider)?.team || null;

  return (
    <div className="page" style={{ paddingBottom: '2rem' }}>
      <Hero
        title="Tour"
        subtitle="Stillingen i alle Tour de France-konkurrencer — samlet, point, bjerg, ungdom og hold."
        chips={data?.afterStage ? [`Efter etape ${data.afterStage}`] : ['Afventer løbsstart']}
      />

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
                  name={jerseys[j.holderKey] || standings[j.std]?.[0]?.rider}
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

          {/* Fulde stillinger pr. konkurrence */}
          <section style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem' }}>
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
                <StandingsTable rows={data.stageResult} valueType="time" />
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
