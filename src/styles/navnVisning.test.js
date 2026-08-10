/**
 * Kortkode ELLER holdnavn — aldrig begge.
 *
 * Kampkortet viste et stykke tid "ARS Arsenal" og "COV Coventry City": koden
 * og navnet ved siden af hinanden, hvor koden er en forkortelse af netop det
 * navn. Tipshistorikken havde den modsatte fejl og viste kun koder, så man
 * skulle kunne tolvte-dels-alfabetet udenad for at læse sin egen historik.
 *
 * Begge er nu løst med den SAMME regel: begge tekster står i DOM'en, og CSS
 * vælger den ene efter pladsen.
 *
 * HVORFOR EN TEST PÅ CSS. Beslutningen bor udelukkende i stylesheetet — jsdom
 * anvender ingen stylesheets, så komponenttesten ved siden af kan kun se, at
 * begge tekster findes. Fjerner nogen `display: none`, står de begge på
 * skærmen igen, og hele rettelsen er rullet tilbage med grøn suite. Præcis den
 * slags tavse tilbagerulning, huset har brændt sig på før.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'theme.css'), 'utf8');

/**
 * Alt inde i @media (max-width: N px) — samlet, uanset hvor blokkene står.
 *
 * Almindelig strengsøgning frem for et konstrueret RegExp. Første udgave
 * brugte `new RegExp` og var over-escaped, så mønsteret ledte efter et
 * bogstaveligt backslash og fandt aldrig noget — en test, der består ved at
 * lede det forkerte sted, er værre end ingen test.
 */
function iMedie(px) {
  const maerke = `@media (max-width: ${px}px) {`;
  const ud = [];
  let fra = css.indexOf(maerke);
  while (fra !== -1) {
    // Tæl krøllede parenteser, så indlejrede regler tages med — og kun dem.
    let dybde = 1;
    let i = fra + maerke.length;
    while (i < css.length && dybde > 0) {
      if (css[i] === '{') dybde += 1;
      else if (css[i] === '}') dybde -= 1;
      i += 1;
    }
    ud.push(css.slice(fra, i));
    fra = css.indexOf(maerke, i);
  }
  return ud.join('\n');
}

describe('kampkortet — kode og navn er gensidigt udelukkende', () => {
  // Grundtilstanden: navnet vises, koden er skjult. Uden den her linje står
  // begge på en almindelig skærm — den fejl, rettelsen handler om.
  it('skjuler kortkoden på almindelig skærm', () => {
    const regel = /\.match-card__side-code\s*\{[^}]*display:\s*none/;
    expect(css).toMatch(regel);
  });

  it('bytter dem om under 420 px', () => {
    const smal = iMedie(420);
    expect(smal).toMatch(/\.match-card__side-name\s*\{[^}]*display:\s*none/);
    expect(smal).toMatch(/\.match-card__side-code\s*\{[^}]*display:\s*inline/);
  });
});

describe('tipshistorikken — fuldt navn, kortkode på smal skærm', () => {
  it('skjuler kortkoden på almindelig skærm', () => {
    expect(css).toMatch(/\.mytips__hold-kort\s*\{\s*display:\s*none/);
  });

  it('bytter dem om under 480 px', () => {
    const smal = iMedie(480);
    expect(smal).toMatch(/\.mytips__hold\s*\{[^}]*display:\s*none/);
    expect(smal).toMatch(/\.mytips__hold-kort\s*\{[^}]*display:\s*inline/);
  });

  // Knækpunktet må ikke være det samme som kampkortets. Rækken her er et
  // gitter med kickoff, kamp, tip og resultat, så navnet har mindre plads end
  // på kortet og skal skifte tidligere. Sættes de ens, bliver "Sønderjyske
  // Fodbold – Viborg FF" klippet til ukendelighed mellem 420 og 480 px.
  it('skifter FØR kampkortet, fordi rækken har mindre plads', () => {
    expect(iMedie(480)).toContain('mytips__hold');
    expect(iMedie(420)).not.toContain('mytips__hold');
  });
});
