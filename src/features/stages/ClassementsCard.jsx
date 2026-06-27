// ClassementsCard – de fire trøjer + holdkonkurrencen efter seneste etape.
import TeamBadge from '../../components/TeamBadge';

const JERSEYS = [
  { key: 'yellow', emoji: '🟡', label: 'Gul (samlet)' },
  { key: 'green', emoji: '🟢', label: 'Grøn (sprint)' },
  { key: 'polka', emoji: '🔴', label: 'Prikket (bjerg)' },
  { key: 'white', emoji: '⬜', label: 'Hvid (ungdom)' },
];

export default function ClassementsCard({ jerseys, afterStage }) {
  if (!jerseys) return null;
  return (
    <div className="card" style={{ marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <strong>Klassementer</strong>
        {afterStage ? <span style={{ fontSize: '0.78rem', color: 'var(--c-muted)' }}>efter etape {afterStage}</span> : null}
      </div>
      <div style={{ display: 'grid', gap: '0.35rem' }}>
        {JERSEYS.map(({ key, emoji, label }) => (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
            <span>{emoji} {label}</span>
            <strong>{jerseys[key] || '—'}</strong>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', borderTop: '1px solid var(--c-border, #eee)', paddingTop: '0.35rem' }}>
          <span>🏆 Holdkonkurrence</span>
          <strong>{jerseys.teamLead ? <TeamBadge name={jerseys.teamLead} /> : '—'}</strong>
        </div>
      </div>
    </div>
  );
}
