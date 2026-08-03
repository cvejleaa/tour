/**
 * Avatar — rund avatar med enten valgt emoji eller initialer på en
 * personlig farve, med et lille yndlingshold-mærke (cykelhold-trøje/logo)
 * i hjørnet.
 */
import { avatarColor, initials } from '../features/profile/avatarUtils';
import { teamMeta, prettyTeam } from '../data/tourTeams2026';
import { isJerseyToken, JERSEY_BY_TOKEN, JerseyIcon } from '../data/jerseyAvatars';
import { PLATFORM_MODE } from '../lib/platform';

export default function Avatar({
  uid = '',
  name = '',
  emoji = null,
  favoriteTeam = null,
  size = 32,
}) {
  const bg = avatarColor(uid || name);
  // På den samlede platform vises Tour-trøje-avatarer IKKE (selv hvis en gemt/
  // migreret profil har en). En trøje-token falder tilbage til initialer.
  const jersey = (!PLATFORM_MODE && isJerseyToken(emoji)) ? JERSEY_BY_TOKEN[emoji] : null;
  const shownEmoji = (PLATFORM_MODE && isJerseyToken(emoji)) ? null : emoji;
  const fontSize = shownEmoji ? size * 0.58 : size * 0.42;

  // Yndlingshold-mærke: cykelholdets trøje/logo. Skjules på platformen.
  const meta = (!PLATFORM_MODE && favoriteTeam) ? teamMeta(favoriteTeam) : null;
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
          background: shownEmoji ? 'var(--c-surface-2, #eee)' : bg,
          color: '#fff', fontWeight: 700, fontSize, lineHeight: 1,
          overflow: 'hidden',
        }}
      >
        {jersey
          ? <JerseyIcon kind={jersey.kind} size={Math.round(size * 0.74)} title={jersey.label} />
          : (shownEmoji || initials(name))}
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
