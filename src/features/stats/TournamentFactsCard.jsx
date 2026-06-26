// Nøgletals-bånd for turneringen: mål/kamp, hjemme/ude, mål-typer, hyppigste
// resultat samt tidligste og seneste mål.
import { computeTournamentFacts } from './statsUtils';
import { teamName } from '../../lib/teams';

function Stat({ label, value }) {
  return (
    <div style={{ flex: '1 1 7rem', minWidth: '7rem' }}>
      <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--c-pitch)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: '0.74rem', color: 'var(--c-muted)' }}>{label}</div>
    </div>
  );
}

function goalLine(gObj) {
  if (!gObj) return null;
  const min = `${gObj.minute}${gObj.injuryTime ? `+${gObj.injuryTime}` : ''}'`;
  const who = gObj.scorer ? `${gObj.scorer} ` : '';
  const match = `${teamName(gObj.home)}–${teamName(gObj.away)}`;
  return `${min} · ${who}(${match})`;
}

export default function TournamentFactsCard({ matches }) {
  const f = computeTournamentFacts(matches);
  if (f.played === 0) return null;

  const tb = f.typeBreakdown;
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 0.6rem', fontSize: '1.15rem' }}>📊 Turneringen i tal</h2>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <Stat label="afgjorte kampe" value={f.played} />
        <Stat label="mål i alt" value={f.totalGoals} />
        <Stat label="mål pr. kamp" value={f.goalsPerMatch} />
        <Stat label="hjemme–ude mål" value={`${f.homeGoals}–${f.awayGoals}`} />
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
        <span className="badge badge--muted">⚽ {tb.regular} åbent spil</span>
        <span className="badge badge--muted">🎯 {tb.penalty} straffe</span>
        <span className="badge badge--muted">🙃 {tb.own} selvmål</span>
      </div>

      {f.frequentResults.length > 0 && (
        <div style={{ fontSize: '0.85rem', marginBottom: '0.35rem' }}>
          <span style={{ color: 'var(--c-muted)' }}>Hyppigste resultat: </span>
          {f.frequentResults.map((r) => `${r.score} (${r.count}×)`).join(' · ')}
        </div>
      )}
      {f.earliest && (
        <div style={{ fontSize: '0.82rem', color: 'var(--c-muted)' }}>⏱️ Tidligste mål: {goalLine(f.earliest)}</div>
      )}
      {f.latest && (
        <div style={{ fontSize: '0.82rem', color: 'var(--c-muted)' }}>🕒 Seneste mål: {goalLine(f.latest)}</div>
      )}
    </div>
  );
}
