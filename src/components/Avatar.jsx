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

  // KLUBRINGEN TEGNES INDAD, og det er en rettelse af den første udgave.
  //
  // Dér lå ringen UDEN FOR cirklen, og cirklen krympede tilsvarende, så
  // avataren holdt sin plads i rækken. Prisen var målt og for høj: ved 22 px
  // (ligatabellen og liga-væggen) gik cirklen fra 22 til 16 px og initialerne
  // fra 9,2 til 6,7 px — 5,9 px med en sekundærfarve, og en emoji fra 12,8 til
  // 8,1 px. En spiller, der TOG funktionen i brug, blev altså sværere at kende
  // end en, der lod være. Og "man kan skelne spillerne" var netop grunden til
  // ring frem for fyld.
  //
  // Med `inset` lægger ringen sig i cirklens yderste bånd i stedet. Initialerne
  // står midt i og fylder omtrent 42 % af diameteren, så de rører den ikke:
  // ved 22 px når teksten ~4,6 px ud fra midten, og ringens inderkant ligger
  // ved 8 px. Kun hårlinjen ligger udenpå og koster 1 px.
  //
  // Bredden er 8 % af størrelsen, dog mindst 2 px: 1 px forsvinder på en
  // 1×-skærm, og det er præcis de små størrelser, hvor ringen skal bære sin
  // besked.
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
  // KUN HÅRLINJEN ligger uden på cirklen, så ringen koster netop 1 px i radius.
  // Uden klubfarver koster den ingenting, og den gren skal stå eksplicit —
  // ellers ville hver avatar i hele appen blive mindre.
  const diameter = klubFarver ? size - 2 : size;
  // Skriftstørrelsen følger `size`, ikke cirklen. Det er hele pointen med den
  // indadgående ring: initialerne er lige så store med ring som uden.
  const fontSize = shownEmoji ? size * 0.58 : size * 0.42;
  const haarlinje = klubFarver && textOn(klubFarver.primaer) === '#ffffff'
    ? 'rgba(255,255,255,.5)'
    : 'rgba(0,0,0,.3)';
  // Rækkefølgen er MALERÆKKEFØLGEN: den første skygge ligger øverst.
  // Primærringen står derfor før sekundærringen, så sekundærfarven kun ses i
  // det 1 px brede bånd, primærringen ikke dækker.
  const ringe = klubFarver ? [
    `inset 0 0 0 ${ringBredde}px ${klubFarver.primaer}`,
    harSekundaer ? `inset 0 0 0 ${ringBredde + 1}px ${klubFarver.sekundaer}` : null,
    `0 0 0 1px ${haarlinje}`,
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
