/**
 * ClubBadge — selvstændig hold-badge. Ingen eksterne logoer.
 *
 * TO FORMER, valgt af BRUGSSTEDET og ikke af dataen:
 *   variant="troeje" – trøje-silhuet i klubbens farver, med striber/bøjler
 *   variant="cirkel" – farvet cirkel med kortkoden (som før)
 *
 * Formen må IKKE vælges automatisk ud fra, om holdet har to farver. Så ville
 * en tabelkolonne vise Newcastle som trøje og Liverpool som cirkel — to
 * formsprog i samme kolonne.
 *
 * KORTKODEN KAN IKKE STÅ I TRØJEN. Kroppen er 10 af 32 enheder bred, så "BHA"
 * fylder 2,4-2,8 gange kroppens bredde ved alle tre kanoniske størrelser (22,
 * 32, 44). Det er geometri, ikke smag. Derfor bærer trøje-varianten ingen
 * tekst, og brugsstedet skal selv vise koden ved siden af — hvad fire af de
 * fem steder allerede gjorde, før trøjen kom til.
 *
 * Kanoniske størrelser: 22 (tabel), 32 (liste), 44 (kamp-kort).
 */
import { textOn } from '../lib/contrastText';

// Trøjen tegnes i et 24×24-felt. Kroppen er bevidst bredere end en rigtig
// trøje: ved 22 px er hver enhed under en pixel, og en naturtro smal krop ville
// ikke kunne bære to farver.
const KROP = 'M7.4 4.2 L10 3 Q12 5.3 14 3 L16.6 4.2 L16.6 21 L7.4 21 Z';
const AERME_V = 'M7.4 4.2 L4 6 L3 10.5 L6.2 11.5 L7.4 8.4 Z';
const AERME_H = 'M16.6 4.2 L20 6 L21 10.5 L17.8 11.5 L16.6 8.4 Z';

/**
 * Båndene i mønsteret. TRE bånd og ikke flere: kroppen er 6,9 px bred ved
 * størrelse 22, så fire bånd giver 1,4 px hver og bliver til grød på en
 * 1×-skærm. En rigtig stribet trøje har 12-14 striber — badgen er en
 * genkendelse, ikke en gengivelse.
 */
function baand(moenster, farve) {
  if (moenster === 'striber') {
    // Lodrette: to bånd i sekundærfarven med primærfarven imellem og udenom.
    return [
      <rect key="a" x="9.0" y="2.5" width="1.6" height="19" fill={farve} />,
      <rect key="b" x="13.4" y="2.5" width="1.6" height="19" fill={farve} />,
    ];
  }
  if (moenster === 'boejler') {
    return [
      <rect key="a" x="6.5" y="7.5" width="11" height="2.6" fill={farve} />,
      <rect key="b" x="6.5" y="14" width="11" height="2.6" fill={farve} />,
    ];
  }
  if (moenster === 'halveret') {
    return [<rect key="a" x="12" y="2.5" width="6" height="19" fill={farve} />];
  }
  if (moenster === 'vandret-delt') {
    return [<rect key="a" x="6.5" y="12" width="11" height="9.5" fill={farve} />];
  }
  return [];
}

let idTaeller = 0;

export default function ClubBadge({
  code = '?',
  color = '#888888',
  size = 32,
  title,
  variant = 'cirkel',
  color2 = null,
  moenster = null,
  aerme = null,
}) {
  if (variant === 'troeje') {
    // Klip-id skal være entydigt: to trøjer på samme kampkort med samme id
    // ville dele klipsti, og den ene ville miste sit mønster.
    idTaeller += 1;
    const klip = `troeje-klip-${idTaeller}`;
    const aermeFarve = aerme || color;
    // Konturen holder en næsten hvid trøje fra at blive et hul i en lys
    // tabel — og en næsten sort fra at forsvinde i mørkt tema. Den skal have
    // non-scaling-stroke, ellers æder den 20 % af kroppens bredde ved 22 px.
    const kontur = 'rgba(0,0,0,.32)';
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        role="img"
        aria-label={title || code}
        style={{ flex: '0 0 auto', display: 'block' }}
      >
        {/* INTET <title>-element. aria-label på role="img" giver samme
            oplæsning, men et title-element lægger holdnavnet ind som TEKST i
            dokumentet — og så står "Arsenal" to gange, når brugsstedet i
            forvejen skriver navnet ved siden af. Det brød fire tests og ville
            have brudt oplæsningen på samme måde. */}
        <defs>
          <clipPath id={klip}><path d={KROP} /></clipPath>
        </defs>
        <path d={AERME_V} fill={aermeFarve} stroke={kontur} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={AERME_H} fill={aermeFarve} stroke={kontur} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={KROP} fill={color} />
        {color2 && moenster && (
          <g clipPath={`url(#${klip})`}>{baand(moenster, color2)}</g>
        )}
        <path d={KROP} fill="none" stroke={kontur} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }

  const fg = textOn(color);
  const fontSize = Math.max(10, Math.round(size * 0.40));
  return (
    <span
      role="img"
      aria-label={title || code}
      title={title || code}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        color: fg,
        fontWeight: 800,
        fontSize,
        lineHeight: 1,
        letterSpacing: '-0.02em',
        fontVariantNumeric: 'tabular-nums',
        flex: '0 0 auto',
        boxShadow: fg === '#ffffff'
          ? 'inset 0 0 0 1.5px rgba(255,255,255,.22)'
          : 'inset 0 0 0 1.5px rgba(0,0,0,.10), 0 0 0 1px var(--c-border)',
      }}
    >
      {code}
    </span>
  );
}
