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
 * Mønsteret oven på kroppen. Alt herinde klippes til trøjens silhuet, så både
 * rektangler og polygoner kan bruges.
 *
 * TRE bånd og ikke flere: kroppen er 6,9 px bred ved størrelse 22, så fire bånd
 * giver 1,4 px hver og bliver til grød på en 1×-skærm. En rigtig stribet trøje
 * har 12-14 striber — badgen er en genkendelse, ikke en gengivelse.
 *
 * SET FORFRA — badgens venstre er BESKUERENS venstre.
 *
 * Det lyder selvindlysende og var det ikke: både `skraabaand` og `ternet` blev
 * tegnet spejlvendt, fordi de blev beskrevet i BÆRERENS koordinater ("fra
 * venstre skulder"), som er modsat. To former, samme fejl, ingen test der
 * fangede det. Beskriv altid en form ved, hvor den ligger på FOTOET.
 *
 * OTTE FORMER. De fem første kom med badgen; `skraabaand`, `baand` og
 * `firkanter` kom til, fordi tre danske trøjer ellers måtte stå ensfarvede,
 * selv om de tydeligt har et mønster. Formen skal matche trøjen PRÆCIST — et
 * enkelt brystbånd tegnet som `boejler` bliver til to bånd, altså en anden
 * trøje end den, klubben spiller i. Det var grunden til, at Brøndby og Randers
 * stod uden mønster, indtil de her tre kom til.
 *
 *   striber       lodrette, to bånd
 *   boejler       vandrette, to bånd
 *   ternet        to modstående kvadranter — en KVARTERET trøje
 *   halveret      højre halvdel
 *   vandret-delt  nederste halvdel
 *   skraabaand    ét diagonalt bånd
 *   baand         ét vandret bånd over BRYSTET
 *   firkanter     3×4-skakbræt — et egentligt bræt, modsat `ternet`
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
  if (moenster === 'ternet') {
    // Fire felter i et 2×2 — ikke et rigtigt skakbræt. Fulhams udetrøje har
    // snesevis af tern; ved 22 px ville de blive til en rødsort tåge, og så
    // var vi tilbage ved det farvegennemsnit, hele øvelsen skulle undgå.
    //
    // SEKUNDÆRFARVEN LIGGER ØVERST TIL HØJRE. Den lå øverst til venstre, og så
    // var Randers' tredjetrøje spejlvendt: den har orange øverst til venstre,
    // og orange er primærfarven. Se SET FORFRA ovenfor.
    return [
      <rect key="a" x="12" y="2.5" width="5.5" height="9.5" fill={farve} />,
      <rect key="b" x="7" y="12" width="5" height="9.5" fill={farve} />,
    ];
  }
  if (moenster === 'halveret') {
    return [<rect key="a" x="12" y="2.5" width="6" height="19" fill={farve} />];
  }
  if (moenster === 'vandret-delt') {
    return [<rect key="a" x="6.5" y="12" width="11" height="9.5" fill={farve} />];
  }
  if (moenster === 'skraabaand') {
    // ÉT skråbånd fra ØVERST TIL HØJRE ned mod nederst til venstre — Randers'
    // hjemmetrøje. Retningen er målt række for række på klubbens eget foto:
    // båndets midte flytter sig fra x=805 ved y=200 til x=351 ved y=800.
    //
    // Den var spejlvendt i første udgave, fordi kommentaren sagde "fra venstre
    // skulder" — sandt i BÆRERENS koordinater og falsk i beskuerens. Badgen
    // tegnes i beskuerens. Se SET FORFRA ovenfor.
    //
    // Bredden er valgt, så båndet fylder omtrent det samme af kroppen som på
    // trøjen selv (målt: 21,3 %, renderet: 21,9 %). Et smallere bånd forsvinder
    // ved 22 px; et bredere ville dele trøjen i to og ligne `halveret`.
    return [<polygon key="a" points="6,18.6 6,13.8 18,6.8 18,11.6" fill={farve} />];
  }
  if (moenster === 'baand') {
    // ÉT vandret BRYSTbånd — Brøndbys udetrøje. Adskilt fra `boejler`, som
    // tegner TO: et enkelt bånd tegnet som to bånd er en anden trøje, og det
    // var netop derfor Brøndby stod ensfarvet, indtil formen kom til.
    //
    // Højden er MÅLT, og tallet er rettet to gange. Første udgave lagde båndet
    // i taljen (49 %). Anden udgave sagde 38 % — også forkert, fordi den regnede
    // tyngdepunktet af ALLE gule pixels, og `gul` fanger også kraven og
    // sponsortrykket. Det rigtige mål er den bredeste sammenhængende gule
    // stribe i et lodret snit, altså båndet selv:
    //
    //   node scripts/superliga-ude-tredje.mjs --moenster
    //   → båndets egen midte: y=314 = 34 % af trøjens højde
    //
    // 2,5 + 0,34 × 19 = 8,96, minus den halve båndhøjde på 1,7 → y = 7,3.
    return [<rect key="a" x="6.5" y="7.3" width="11" height="3.4" fill={farve} />];
  }
  if (moenster === 'firkanter') {
    // STORE FIRKANTER i et 3×4-skakbræt. INGEN TRØJE BRUGER DEN ENDNU.
    //
    // Her stod, at den blev lavet til OB's tredjetrøje, og at det "er farverne,
    // ikke figuren, der ikke duer". Det er forkert, og begrundelsen er skiftet:
    // brættet her tegner 6 af 12 felter, altså 50/50, mens OB's tern måler
    // 28,2 % mod 71,8 %. Den ville have givet OB dobbelt så meget sekundærfarve
    // som trøjen har — formen passede aldrig til den trøje, uanset kontrasten.
    // Det bryder mod badgens egen hovedregel om, at formen skal matche PRÆCIST,
    // og det var netop derfor `baand` blev skilt fra `boejler`.
    //
    // Den bliver stående alligevel: et vokabular med huller er værre end et med
    // en ubrugt plads. Betingelsen for at tage den i brug er en trøje med et
    // skakbræt tæt på 50/50 og over 2:1 i kontrast — ikke OB's.
    //
    // Forskellen til
    // `ternet` er antallet: `ternet` er to modstående kvadranter (en kvarteret
    // trøje), det her er et egentligt bræt. Tre kolonner og ikke fire: kroppen
    // er 6,9 px bred ved størrelse 22, så fire kolonner giver 1,7 px hver.
    const felter = [];
    const bredde = 11 / 3;
    const hoejde = 19 / 4;
    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        if ((r + c) % 2 !== 0) continue;
        felter.push(<rect
          key={`${r}-${c}`}
          x={6.5 + c * bredde}
          y={2.5 + r * hoejde}
          width={bredde}
          height={hoejde}
          fill={farve}
        />);
      }
    }
    return felter;
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
