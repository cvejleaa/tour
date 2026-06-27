// ---------------------------------------------------------------------------
// TeamBadge – lille skrivebeskyttet visning af et hold: lille logo/trøje-
// miniature + pænt holdnavn. Falder pænt tilbage til kun navnet hvis der
// ikke findes metadata/logo. Bruges til "facit"/låste holdvisninger.
// ---------------------------------------------------------------------------
import { teamMeta, prettyTeam } from '../data/tourTeams2026';

export default function TeamBadge({ name, size = 18, showName = true, style }) {
  if (!name) return <span style={style}>—</span>;
  const meta = teamMeta(name);
  const label = prettyTeam(meta?.name || name);
  const src = meta?.logo || meta?.jersey || null;
  return (
    <span
      data-testid="team-badge"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', ...style }}
    >
      {src && (
        <img
          src={src}
          alt=""
          aria-hidden="true"
          loading="lazy"
          width={size}
          height={size}
          style={{ width: size, height: size, objectFit: 'contain', borderRadius: 4, flex: '0 0 auto' }}
        />
      )}
      {showName && <span>{label}</span>}
    </span>
  );
}
