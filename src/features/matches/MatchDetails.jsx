// ---------------------------------------------------------------------------
// MatchDetails – viser kampdetaljer fra football-data.org (gemt på match.details
// af Cloud Function syncMatchDetails): mål-feed, kort, halvleg/straffe/tilskuere
// og en udfoldelig opstilling pr. hold.
// ---------------------------------------------------------------------------
import { useState } from 'react';
import { flipSide, goalsWithRunningScore } from './matchHelpers';

const CARD_ICON = { YELLOW: '🟨', RED: '🟥', YELLOW_RED: '🟨🟥' };

function goalSuffix(type) {
  if (type === 'PENALTY') return ' (str.)';
  if (type === 'OWN') return ' (selvmål)';
  return '';
}

function minuteLabel(ev) {
  if (ev.minute == null) return '';
  return ev.injuryTime ? `${ev.minute}+${ev.injuryTime}'` : `${ev.minute}'`;
}

function eventText(ev) {
  if (ev.kind === 'goal') {
    return `${ev.scorer ?? '?'}${ev.assist ? ` (assist: ${ev.assist})` : ''}${goalSuffix(ev.type)}`;
  }
  if (ev.kind === 'sub') {
    return `${ev.playerIn ?? '?'} ↑ ${ev.playerOut ?? '?'} ↓`;
  }
  return `${ev.player ?? '?'}`;
}

function eventIcon(ev) {
  if (ev.kind === 'goal') return '⚽';
  if (ev.kind === 'sub') return '🔄';
  return CARD_ICON[ev.card] ?? '🟨';
}

// Én begivenheds-række (mål, kort eller udskiftning), venstre = hjemme, højre = ude.
function EventRow({ ev }) {
  const home = ev.side === 'home';
  const text = eventText(ev);
  const icon = eventIcon(ev);

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center',
      gap: '0.5rem', fontSize: '0.82rem', padding: '0.15rem 0',
    }}>
      <div style={{ textAlign: 'right', color: home ? 'var(--c-text)' : 'transparent' }}>
        {home && <span>{text} {icon}</span>}
      </div>
      <div style={{
        color: 'var(--c-muted)', fontVariantNumeric: 'tabular-nums', minWidth: 40,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
      }}>
        <span>{minuteLabel(ev)}</span>
        {ev.kind === 'goal' && ev.score && (
          <span
            data-testid="running-score"
            style={{
              fontSize: '0.7rem', fontWeight: 700, color: 'var(--c-text)',
              background: 'var(--c-border)', borderRadius: 4, padding: '0 0.25rem',
            }}
          >
            {ev.score.home}–{ev.score.away}
          </span>
        )}
      </div>
      <div style={{ textAlign: 'left', color: !home ? 'var(--c-text)' : 'transparent' }}>
        {!home && <span>{icon} {text}</span>}
      </div>
    </div>
  );
}

function TeamLineup({ title, team }) {
  if (!team || (!team.lineup?.length && !team.bench?.length)) return null;
  return (
    <div style={{ flex: 1, minWidth: 180 }}>
      <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
        {title}{team.formation ? ` · ${team.formation}` : ''}
      </div>
      {team.coach && <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)' }}>Træner: {team.coach}</div>}
      <ol style={{ margin: '0.35rem 0 0', paddingLeft: '1.2rem', fontSize: '0.82rem' }}>
        {team.lineup.map((p, i) => (
          <li key={`${p.name}-${i}`}>
            {`${p.shirt != null ? `${p.shirt}. ` : ''}${p.name}`}
            {p.position ? <span style={{ color: 'var(--c-muted)' }}> · {p.position}</span> : null}
          </li>
        ))}
      </ol>
      {team.bench?.length > 0 && (
        <div style={{ fontSize: '0.76rem', color: 'var(--c-muted)', marginTop: '0.3rem' }}>
          Bænk: {team.bench.map((p) => p.name).join(', ')}
        </div>
      )}
    </div>
  );
}

/**
 * @param {{ match: object, homeName: string, awayName: string }} props
 */
export default function MatchDetails({ match, homeName, awayName }) {
  const [showLineups, setShowLineups] = useState(false);
  const d = match.details;
  if (!d) return null;

  // Saml mål + kort + udskiftninger kronologisk. Mål får den løbende stilling,
  // og selvmål tæller for modstanderen — så de vises på den modsatte side (med
  // scorerens navn + "(selvmål)"), mens selve scoren regnes på de rå mål.
  const events = [
    ...goalsWithRunningScore(d.goals ?? []).map((g) => ({
      ...g, kind: 'goal', side: g.type === 'OWN' ? flipSide(g.side) : g.side,
    })),
    ...(d.bookings ?? []).map((b) => ({ ...b, kind: 'card' })),
    ...(d.substitutions ?? []).map((s) => ({ ...s, kind: 'sub' })),
  ].sort((a, b) => ((a.minute ?? 999) - (b.minute ?? 999)) || ((a.injuryTime ?? 0) - (b.injuryTime ?? 0)));

  const meta = [];
  if (d.halfTime) meta.push(`Halvleg ${d.halfTime.home}–${d.halfTime.away}`);
  if (d.penalties) meta.push(`Straffe ${d.penalties.home}–${d.penalties.away}`);
  if (d.attendance != null) meta.push(`${d.attendance.toLocaleString('da-DK')} tilskuere`);
  if (d.referee) meta.push(`Dommer: ${d.referee}`);

  const hasLineups = !!d.lineups && (d.lineups.home?.lineup?.length || d.lineups.away?.lineup?.length);

  if (events.length === 0 && meta.length === 0 && !hasLineups) return null;

  return (
    <div style={{ marginBottom: '0.6rem', borderTop: '1px solid var(--c-border)', paddingTop: '0.5rem' }}>
      {events.length > 0 && (
        <div style={{ marginBottom: meta.length ? '0.4rem' : 0 }}>
          {events.map((ev, i) => <EventRow key={i} ev={ev} />)}
        </div>
      )}

      {meta.length > 0 && (
        <div style={{ fontSize: '0.76rem', color: 'var(--c-muted)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {meta.map((t) => <span key={t}>{t}</span>)}
        </div>
      )}

      {hasLineups && (
        <div style={{ marginTop: '0.4rem' }}>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setShowLineups((v) => !v)}
            aria-expanded={showLineups}
          >
            {showLineups ? '▾ Skjul opstillinger' : '▸ Vis opstillinger'}
          </button>
          {showLineups && (
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              <TeamLineup title={homeName} team={d.lineups.home} />
              <TeamLineup title={awayName} team={d.lineups.away} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
