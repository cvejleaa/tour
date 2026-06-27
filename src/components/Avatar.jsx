/**
 * Avatar — rund avatar med enten valgt emoji eller initialer på en
 * personlig farve, med et lille yndlingshold-mærke (cykelhold-trøje/logo)
 * i hjørnet.
 */
import { avatarColor, initials } from '../features/profile/avatarUtils';
import { teamMeta, prettyTeam } from '../data/tourTeams2026';

export default function Avatar({
  uid = '',
  name = '',
  emoji = null,
  favoriteTeam = null,
  size = 32,
}) {
  const bg = avatarColor(uid || name);
  const fontSize = emoji ? size * 0.58 : size * 0.42;

  // Yndlingshold-mærke: vis cykelholdets trøje eller logo. Hvis holdet ikke
  // findes (fx gamle lande-koder), vis intet mærke.
  const meta = favoriteTeam ? teamMeta(favoriteTeam) : null;
  const badgeSrc = meta?.jersey || meta?.logo || null;
  const badgeAlt = badgeSrc ? prettyTeam(favoriteTeam) : '';

  return (
    <span
      style={{ position: 'relative', display: 'inline-block', width: size, height: size, flexShrink: 0 }}
      aria-hidden="true"
    >
      <span
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: size, height: size, borderRadius: '50%',
          background: emoji ? 'var(--c-surface-2, #eee)' : bg,
          color: '#fff', fontWeight: 700, fontSize, lineHeight: 1,
          overflow: 'hidden',
        }}
      >
        {emoji || initials(name)}
      </span>
      {badgeSrc && (
        <img
          src={badgeSrc}
          alt={badgeAlt}
          title={badgeAlt}
          width={Math.round(size * 0.42)}
          height={Math.round(size * 0.32)}
          style={{
            position: 'absolute', right: -2, bottom: -2,
            borderRadius: 2, border: '1.5px solid var(--c-surface, #fff)',
            objectFit: 'cover',
          }}
        />
      )}
    </span>
  );
}
