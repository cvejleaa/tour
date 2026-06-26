// Kompakt række til tidligere (afsluttede) kampe: kun flag + hold + endeligt
// resultat. Klik folder kampen ud til det fulde MatchCard (håndteres af forælder).
import Flag from '../../components/Flag';
import { teamName } from '../../lib/teams';
import { MATCH_STATUS } from '../../lib/constants';

function TeamSide({ code, align }) {
  const flag = code ? <Flag code={code} size={18} /> : <span style={{ fontSize: '1rem' }}>❓</span>;
  const name = (
    <span style={{ fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {code ? teamName(code) : '?'}
    </span>
  );
  return (
    <span style={{
      flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.4rem',
      justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
    }}>
      {align === 'right' ? <>{name}{flag}</> : <>{flag}{name}</>}
    </span>
  );
}

/**
 * @param {{ match: object, onClick: () => void }} props
 */
export default function MatchRowCompact({ match, onClick }) {
  const isKnockout = match.round && match.round !== 'group';
  const advance = isKnockout && match.status === MATCH_STATUS.FINISHED ? match.result?.advance : null;

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="match-row-compact"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer',
        padding: '0.45rem 0.6rem', borderBottom: '1px solid var(--c-border)', fontSize: '0.88rem',
      }}
    >
      <span style={{ color: 'var(--c-muted)', fontSize: '0.7rem' }}>▸</span>
      <TeamSide code={match.homeTeam} align="right" />
      <strong
        data-testid="compact-result"
        style={{ minWidth: 42, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
      >
        {match.result ? `${match.result.home}–${match.result.away}` : '–'}
      </strong>
      <TeamSide code={match.awayTeam} align="left" />
      {advance && (
        <span className="badge badge--muted" style={{ fontSize: '0.66rem', whiteSpace: 'nowrap' }}>
          {teamName(advance)} videre
        </span>
      )}
    </div>
  );
}
