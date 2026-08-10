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

describe('kampkortet — holdnavnet ombrydes i stedet for at blive klippet', () => {
  // KORTKODEN ER VÆK FRA KAMPKORTET. Den blev vist under 600 px, indtil det
  // viste sig, at spillerne ikke ved hvad forkortelserne betyder — "SJF" og
  // "VFF" er ikke almenviden, og de fleste tipper fra telefonen.
  it('har ingen kortkode-regel tilbage', () => {
    expect(regel(udenforMedie(), '.match-card__side-code')).toBeNull();
    expect(regel(iMedie(600), '.match-card__side-code')).toBeNull();
  });

  // Og navnet må ALDRIG skjules igen — det var netop dét, der gjorde koden
  // nødvendig.
  it('skjuler aldrig holdnavnet', () => {
    const grund = regel(udenforMedie(), '.match-card__side-name');
    expect(grund).not.toBeNull();
    expect(grund).not.toContain('display:none');
    expect(regel(iMedie(600), '.match-card__side-name')).toBeNull();
  });

  // OMBRYDNINGEN er hele rettelsen. Uden line-clamp og box-orient falder
  // -webkit-box tilbage til én linje, og navnet er klippet igen.
  it('ombryder navnet over tre linjer', () => {
    const r = regel(udenforMedie(), '.match-card__side-name');
    expect(r).toContain('-webkit-line-clamp:3');
    expect(r).toContain('-webkit-box-orient:vertical');
    expect(r).not.toContain('white-space:nowrap');
  });

  // Uden den her skubber ét langt ord som "Wolverhampton" kortet ud i vandret
  // scroll i stedet for at brydes.
  it('bryder også ord, der er længere end kolonnen', () => {
    expect(regel(udenforMedie(), '.match-card__side-name')).toContain('overflow-wrap:anywhere');
  });

  // DET AFGØRENDE MÅL. Med tre lige kolonner får tankestregen en tredjedel af
  // kortet til ét tegn, og målingen viste, at selv "Nottingham Forest" så var
  // klippet på ENHVER telefonbredde — også med tre linjer.
  // `node scripts/navnbredde.mjs`
  it('giver tankestregen `auto`, ikke en hel tredjedel', () => {
    const r = regel(udenforMedie(), '.match-card__lineup');
    expect(r).toContain('grid-template-columns:1frauto1fr');
    expect(r).not.toContain('repeat(3,1fr)');
  });
});

describe('tipshistorikken — fuldt navn, kortkode på smal skærm', () => {
  it('skjuler kortkoden på almindelig skærm', () => {
    expect(regel(udenforMedie(), '.mytips__hold-kort')).toContain('display:none');
  });

  it('bytter dem om under 600 px — samme grænse som kampkortet', () => {
    const smal = iMedie(600);
    expect(smal, 'ingen 600px-blok i theme.css').not.toBe('');
    expect(regel(smal, '.mytips__hold')).toContain('display:none');
    expect(regel(smal, '.mytips__hold-kort')).toContain('display:inline');
  });

  // Den gamle, lavere grænse må ikke snige sig tilbage og skille de to flader
  // ad igen — det var dén, der gav båndet 481-600 px, hvor kampkortet viste
  // koder og tipshistorikken navne.
  it('skifter IKKE ved 480 px', () => {
    expect(regel(iMedie(480), '.mytips__hold')).toBeNull();
  });
});
