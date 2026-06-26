/**
 * DashboardHub — kort øverst på forsiden: din tip-status i dag, nedtælling til
 * næste kamp og hurtige genveje. Gør det nemt at se hvad man mangler.
 */
import { useMemo } from 'react';
import { computeDashboard } from './dashboardUtils';
import { formatKickoffTime } from './matchHelpers';
import Countdown from './Countdown';
import { teamName } from '../../lib/teams';

export default function DashboardHub({ matches, bets, onJumpToUntipped }) {
  const data = useMemo(() => computeDashboard(matches, bets), [matches, bets]);
  const { todayMatches, missingToday, missingTotal, nextMatch } = data;

  const allTippedToday = todayMatches.length > 0 && missingToday.length === 0;

  return (
    <div
      className="card"
      data-testid="dashboard-hub"
      style={{ marginBottom: '1rem', background: 'linear-gradient(135deg, rgba(22,163,74,0.10), rgba(37,99,235,0.08))' }}
    >
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Tip-status */}
        <div>
          <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Din status i dag
          </div>
          {todayMatches.length === 0 ? (
            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>Ingen kampe i dag ⚽</div>
          ) : allTippedToday ? (
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--c-pitch, #16a34a)' }}>
              Alle dagens {todayMatches.length} kampe er tippet ✓
            </div>
          ) : (
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--c-warn, #ea580c)' }}>
              Du mangler at tippe på {missingToday.length} af dagens {todayMatches.length} kampe
            </div>
          )}
          {missingTotal > 0 && (
            <button
              className="btn btn--sm mt-1"
              onClick={onJumpToUntipped}
              data-testid="hub-jump-untipped"
            >
              Tip nu ({missingTotal} mangler i alt)
            </button>
          )}
        </div>

        {/* Næste kamp + nedtælling */}
        {nextMatch && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Næste kamp
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>
              {teamName(nextMatch.homeTeam)} – {teamName(nextMatch.awayTeam)}
            </div>
            <div style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.2rem' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--c-muted)' }}>kl. {formatKickoffTime(nextMatch.kickoff)}</span>
              <Countdown kickoff={nextMatch.kickoff} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
