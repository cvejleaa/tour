/**
 * Avatar — rund avatar med enten valgt emoji eller initialer på en
 * personlig farve, med et lille yndlingshold-mærke (cykelhold-trøje/logo)
 * i hjørnet.
 *
 * TO SLAGS "YNDLINGSHOLD", OG DE MÅ IKKE BLANDES:
 *
 *   favoriteTeam  et CYKELHOLD i Tour-appen. Tegner et lille trøjebillede i
 *                 hjørnet, og er skjult på platformen.
 *   klubFarver    et FODBOLDHOLD i et spil på platformen. Tegner en ring.
 *
 * De har hver sin prop med vilje. Avatar deles af begge apps, og for en
 * migreret Tour-bruger står der et cykelholdsnavn i `favoriteTeam` — lagde man
 * fodboldpaletten på den samme prop, ville "Visma" og "Viborg FF" ende samme
 * sted. `klubFarverAf` i `football/badges.js` slår derfor op i SPILLETS
 * holdliste og giver null for et navn, den ikke kender.
 *
 * RINGEN, IKKE FYLDET. Fyldet er `avatarColor(uid)` — en hash — og det er dét,
 * der skiller spillerne fra hinanden i stillingen. Blev holdfarven fyldet,
 * ville fem FCK-fans stå som fem ens hvide cirkler, og fladen ville miste
 * noget, den kunne før. Ringen lægger holdet OVEN I den forskel.
 */
import { avatarColor, initials } from '../features/profile/avatarUtils';
import { teamMeta, prettyTeam } from '../data/tourTeams2026';
import { isJerseyToken, JERSEY_BY_TOKEN, JerseyIcon } from '../data/jerseyAvatars';
import { PLATFORM_MODE } from '../lib/platform';
import { textOn } from '../lib/contrastText';

export default function Avatar({
  uid = '',
  name = '',
  emoji = null,
  favoriteTeam = null,
  klubFarver = null,
  size = 32,
}) {
  const bg = avatarColor(uid || name);
  // På den samlede platform vises Tour-trøje-avatarer IKKE (selv hvis en gemt/
  // migreret profil har en). En trøje-token falder tilbage til initialer.
  const jersey = (!PLATFORM_MODE && isJerseyToken(emoji)) ? JERSEY_BY_TOKEN[emoji] : null;
  const shownEmoji = (PLATFORM_MODE && isJerseyToken(emoji)) ? null : emoji;
  // Skriftstørrelsen følger CIRKLEN, ikke `size` — med en ring er cirklen
  // mindre, og to initialer på en 22 px avatar ville ellers flyde ud over den.
  // Beregnes efter `diameter` nedenfor.

  // Yndlingshold-mærke: cykelholdets trøje/logo. Skjules på platformen.
  const meta = (!PLATFORM_MODE && favoriteTeam) ? teamMeta(favoriteTeam) : null;
  const badgeSrc = meta?.jersey || meta?.logo || null;
  const badgeAlt = badgeSrc ? prettyTeam(favoriteTeam) : '';

  // KLUBRINGEN. Bygget af box-shadow frem for en border, fordi skyggerne
  // stables UDEN FOR cirklen og derfor ikke æder af fladen til initialerne —
  // ved 22 px er der ikke plads at give af. Til gengæld skal selve cirklen
  // krympe tilsvarende, ellers ville ringen vokse ud over `size` og skubbe til
  // rækken. Bredden er 8 % af størrelsen, dog mindst 2 px: 1 px forsvinder på
  // en 1×-skærm, og det er præcis de små størrelser (22 px i stillingen), hvor
  // ringen skal bære sin besked.
  //
  // HÅRLINJEN YDERST er ikke pynt, og den skal VENDE MODSAT AF RINGEN.
  // Første udgave var altid mørk, hvilket løser den ene halvdel af problemet:
  // FCK, AGF og Silkeborg spiller i hvidt, og en hvid ring på en hvid
  // tabelrække er ingen ring. Men den anden halvdel blev så synlig i renderen:
  // Midtjyllands sorte ring FORSVANDT i mørkt tema ved 22 og 26 px, fordi både
  // ring og hårlinje var mørke som baggrunden.
  //
  // `textOn` giver netop den modsatte luminans, og så er ringens yderkant
  // synlig mod en hvilken som helst baggrund — lys ring får en mørk kant,
  // mørk ring en lys. Samme problem, ClubBadge løser med sin kontur.
  const ringBredde = klubFarver ? Math.max(2, Math.round(size * 0.08)) : 0;
  const harSekundaer = Boolean(klubFarver?.sekundaer);
  // Lagene indefra og ud: sekundærfarve (1 px), primærfarve, hårlinje (1 px).
  // Hver skygge måles fra cirklens kant, så tallene skal lægges sammen.
  const indre = harSekundaer ? 1 : 0;
  // Uden klubfarver er der INGEN ring, og så må cirklen ikke krympe. Den gren
  // skal stå eksplicit: `indre + ringBredde + 1` giver 1 selv uden ring, og så
  // ville hver avatar i hele appen blive to pixels mindre.
  const ialt = klubFarver ? indre + ringBredde + 1 : 0;
  const diameter = size - 2 * ialt;
  const fontSize = shownEmoji ? diameter * 0.58 : diameter * 0.42;
  const haarlinje = klubFarver && textOn(klubFarver.primaer) === '#ffffff'
    ? 'rgba(255,255,255,.5)'
    : 'rgba(0,0,0,.3)';
  const ringe = klubFarver ? [
    harSekundaer ? `0 0 0 ${indre}px ${klubFarver.sekundaer}` : null,
    `0 0 0 ${indre + ringBredde}px ${klubFarver.primaer}`,
    `0 0 0 ${ialt}px ${haarlinje}`,
  ].filter(Boolean).join(', ') : undefined;

  return (
    <span
      style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, flexShrink: 0,
      }}
      aria-hidden="true"
      title={klubFarver?.navn || undefined}
    >
      <span
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: diameter, height: diameter, borderRadius: '50%',
          background: shownEmoji ? 'var(--c-surface-2, #eee)' : bg,
          color: '#fff', fontWeight: 700, fontSize, lineHeight: 1,
          overflow: 'hidden',
          boxShadow: ringe,
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
