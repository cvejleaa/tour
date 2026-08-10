/**
 * Kortkode ELLER holdnavn — aldrig begge.
 *
 * Kampkortet viste et stykke tid "ARS Arsenal" og "COV Coventry City": koden
 * og navnet ved siden af hinanden, hvor koden er en forkortelse af netop det
 * navn. Tipshistorikken havde den modsatte fejl og viste kun koder, så man
 * skulle kunne tolvte-dels-alfabetet udenad for at læse sin egen historik.
 *
 * Begge er løst med den SAMME regel: begge tekster står i DOM'en, og CSS
 * vælger den ene efter pladsen.
 *
 * HVORFOR EN TEST PÅ CSS. Beslutningen bor udelukkende i stylesheetet — jsdom
 * anvender ingen stylesheets, så komponenttesten ved siden af kan kun se, at
 * begge tekster findes. Fjerner nogen `display: none`, står de begge på
 * skærmen igen, og hele rettelsen er rullet tilbage med grøn suite.
 *
 * TESTEN LÆSER KOMPRIMERET CSS. Første udgave matchede `@media (max-width:
 * 480px) {` bogstaveligt og ville være blevet rød af en ren omformatering —
 * og værre: dens negative assertion (`not.toContain`) var altid grøn, hvis
 * blokken ikke blev fundet, altså præcis når den skulle fange noget. Alt
 * whitespace fjernes nu før sammenligning, og hver negativ assertion kræver
 * først, at blokken FINDES.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'theme.css'), 'utf8')
  .replace(/\s+/g, '');

/** Find slutningen på den blok, der starter ved `{` på plads `aabn`. */
function blokSlut(aabn) {
  let dybde = 1;
  let i = aabn + 1;
  while (i < css.length && dybde > 0) {
    if (css[i] === '{') dybde += 1;
    else if (css[i] === '}') dybde -= 1;
    i += 1;
  }
  return i;
}

/**
 * Alt inde i en media query med `max-width: N px`, uanset hvad der ellers står
 * i forespørgslen. `@media screen and (max-width: 600px)` skal tælle med — en
 * literal-søgning ville have overset den og gjort testen tavst grøn.
 */
function iMedie(px) {
  const re = new RegExp(`@media[^{]*max-width:${px}px[^{]*\\{`, 'g');
  const ud = [];
  let m = re.exec(css);
  while (m) {
    const slut = blokSlut(m.index + m[0].length - 1);
    ud.push(css.slice(m.index, slut));
    re.lastIndex = slut;
    m = re.exec(css);
  }
  return ud.join('');
}

/**
 * CSS UDEN FOR ENHVER @-blok — grundtilstanden.
 *
 * Uden den her søgte "almindelig skærm"-testene i HELE filen, og så bestod de
 * også, hvis reglen var flyttet ind i fx `@media print`: `display: none` fandtes
 * stadig et sted i teksten, mens både kode og navn stod på skærmen. Præcis den
 * mutation overlevede.
 */
function udenforMedie() {
  let ud = '';
  let i = 0;
  while (i < css.length) {
    if (css[i] === '@') {
      const aabn = css.indexOf('{', i);
      const semi = css.indexOf(';', i);
      // @import o.l. slutter med semikolon og har ingen blok.
      if (aabn === -1 || (semi !== -1 && semi < aabn)) { i = semi + 1; continue; }
      i = blokSlut(aabn);
    } else {
      const naeste = css.indexOf('@', i);
      ud += css.slice(i, naeste === -1 ? css.length : naeste);
      i = naeste === -1 ? css.length : naeste;
    }
  }
  return ud;
}

/**
 * Deklarationerne for én selektor. Returnerer null, hvis reglen ikke findes —
 * så en manglende regel bliver rød i stedet for tavst at bestå.
 * Rækkefølgen af deklarationer er ligegyldig; det var den ikke før.
 */
function regel(kilde, selektor) {
  const i = kilde.indexOf(`${selektor}{`);
  if (i === -1) return null;
  return kilde.slice(i + selektor.length + 1, kilde.indexOf('}', i));
}

describe('kampkortet — kode og navn er gensidigt udelukkende', () => {
  it('skjuler kortkoden på almindelig skærm', () => {
    expect(regel(udenforMedie(), '.match-card__side-code')).toContain('display:none');
  });

  // KNÆKPUNKTET ER 600 PX OG ER MÅLT — se scripts/navnbredde.mjs.
  // Det stod på 420, og fra 421 til 585 px stod BÅDE Manchester City og
  // Manchester United som "Manch…" med koden skjult. 428 og 430 px er de mest
  // udbredte store iPhone-bredder, så fejlen ramte netop dem.
  it('viser navnet i grundtilstanden', () => {
    const grund = regel(udenforMedie(), '.match-card__side-name');
    expect(grund).not.toBeNull();
    expect(grund).not.toContain('display:none');
  });

  it('bytter dem om under 600 px', () => {
    const smal = iMedie(600);
    expect(smal, 'ingen 600px-blok i theme.css').not.toBe('');
    expect(regel(smal, '.match-card__side-name')).toContain('display:none');
    expect(regel(smal, '.match-card__side-code')).toContain('display:inline');
  });

  // Den gamle grænse må ikke snige sig tilbage.
  it('skifter IKKE ved 420 px — dér var Manchester-holdene ikke til at skelne', () => {
    expect(regel(iMedie(420), '.match-card__side-name')).toBeNull();
  });
});

describe('tipshistorikken — fuldt navn, kortkode på smal skærm', () => {
  it('skjuler kortkoden på almindelig skærm', () => {
    expect(regel(udenforMedie(), '.mytips__hold-kort')).toContain('display:none');
  });

  it('bytter dem om under 480 px', () => {
    const smal = iMedie(480);
    expect(smal, 'ingen 480px-blok i theme.css').not.toBe('');
    expect(regel(smal, '.mytips__hold')).toContain('display:none');
    expect(regel(smal, '.mytips__hold-kort')).toContain('display:inline');
  });
});

// ---------------------------------------------------------------------------
// RÆKKEFØLGEN MELLEM DE TO, og den er den modsatte af, hvad jeg først skrev.
//
// Jeg satte kortet til at skifte FØR rækken med den begrundelse, at rækken har
// mindre plads. Målingen siger det modsatte: kortet kræver 80-230 px MERE
// viewport end rækken for det samme hold, fordi `repeat(3, 1fr)` giver hver
// side en fast tredjedel, mens rækkens `1fr` deles af begge navne.
//
// Testen her låser retningen, ikke de præcise tal — så knækpunkterne kan
// justeres, uden at den skal skrives om, men de kan ikke bytte plads igen.
// ---------------------------------------------------------------------------
describe('kampkortet skifter SENERE end tips-rækken', () => {
  const graense = (selektor) => {
    for (const px of [320, 360, 380, 400, 420, 440, 460, 480, 500, 540, 560, 600, 640, 700, 720, 768]) {
      if (regel(iMedie(px), selektor) !== null) return px;
    }
    return null;
  };

  it('kortet ved en HØJERE bredde end rækken', () => {
    const kort = graense('.match-card__side-name');
    const raekke = graense('.mytips__hold');
    expect(kort, 'kampkortet har ingen media query').not.toBeNull();
    expect(raekke, 'tips-rækken har ingen media query').not.toBeNull();
    expect(kort).toBeGreaterThan(raekke);
  });

  // Og konkret, så en fremtidig ændring ikke kan sænke kortet under det målte
  // minimum på 586 px uden at nogen tager stilling.
  it('kortet skifter ved mindst 586 px — det målte minimum for Manchester-parret', () => {
    expect(graense('.match-card__side-name')).toBeGreaterThanOrEqual(586);
  });
});
