// ---------------------------------------------------------------------------
// TRØJEOVERSIGTEN — alle spillets hold med deres tre trøjer.
//
// Den skal vise trøjerne, som KAMPKORTET ville tegne dem. Går den uden om
// `badgeFor`, kan et hold stå i én farve her og en anden på kortet, så snart
// ejeren har rettet en farve i admin — præcis den fejl, spilprofilens egen
// trøje havde, indtil den blev lagt om.
//
// OG DEN MÅ IKKE PÅSTÅ MERE, END DEN VED. Første udgave markerede trøjer, hvis
// farve lå under 20 i afstand fra en anden af holdets egne — et tal, jeg selv
// havde fundet på. Det gav to FALSKE (Coventry på 18,6 og Crystal Palace på
// 1,7 fra sin HJEMMEfarve, som `matchBadges` aldrig sammenligner med) og
// oversete ét ÆGTE (Leeds' to gule, 27 fra hinanden, hvor 3. trøjen alligevel
// aldrig vinder). Reglen spørger nu koden i stedet: bliver farven nogensinde
// valgt af `matchBadges` i hele ligaen?
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import TroejeOversigt, { findEksempel, ubrugteTredjetroejer } from './TroejeOversigt';
import { matchBadges, badgeFor } from './badges';
import { SUPERLIGA_TEAMS_2026 } from '../../../data/superligaTeams2026';
import { PREMIER_LEAGUE_TEAMS_2026 } from '../../../data/premierLeagueTeams2026';
import { colorDistance } from '../../../lib/contrastText';

const SPIL = (teams, navn = 'Superligaen') => ({ id: 'g', type: 'football', name: navn, teams });

/** Rækken for ét hold. */
const raekke = (c, navn) => [...c.querySelectorAll('.troejer__hold')]
  .find((e) => e.querySelector('.troejer__navn')?.textContent === navn) || null;

describe('trøjeoversigten', () => {
  it('siger i overskriften, hvad det er — ikke "alle trøjer"', () => {
    // "Alle trøjer" ville læses som et facit på klubbernes spilledragter, og
    // over halvdelen af ude-/tredjefelterne er ikke målt på en trøje.
    const { container } = render(<TroejeOversigt game={SPIL(SUPERLIGA_TEAMS_2026)} />);
    const h = container.querySelector('.troejer__titel').textContent;
    expect(h).toMatch(/Sådan tegnes holdene/);
    expect(h).not.toMatch(/Alle trøjer/);
    // …og spilnavnet står IKKE der: et fodboldspil uden egen holdliste ville
    // ellers påstå "…i Premier League" over Superligaens tolv.
    expect(h).not.toMatch(/Superligaen/);
  });

  // TRØJERNES RÆKKEFØLGE. Base-commit'en handlede netop om, HVOR udeholdet
  // står, og her kunne `SLOTS` byttes om — og etiketten "Hjemme" skiftes til
  // "Bortebane" — med hele suiten grøn.
  it('viser trøjerne i rækkefølgen Hjemme, Ude, 3. trøje', () => {
    const { container } = render(<TroejeOversigt game={SPIL(SUPERLIGA_TEAMS_2026)} />);
    for (const r of container.querySelectorAll('.troejer__hold')) {
      const mrk = [...r.querySelectorAll('.troejer__mrk')].map((e) => e.textContent.split(' ·')[0]);
      expect(mrk).toEqual(['Hjemme', 'Ude', '3. trøje']);
    }
  });

  // HOLDENE STÅR ALFABETISK efter visningsnavn. Sorteringen kunne fjernes ELLER
  // vendes om uden en rød test — og i PL er rådata ikke sorteret, så det er dér,
  // det kan ses.
  it('stiller holdene alfabetisk efter visningsnavn', () => {
    const { container } = render(<TroejeOversigt game={SPIL(PREMIER_LEAGUE_TEAMS_2026, 'PL')} />);
    const navne = [...container.querySelectorAll('.troejer__navn')].map((e) => e.textContent);
    expect(navne).toEqual([...navne].sort((a, b) => a.localeCompare(b, 'da')));
    // …og rådata er IKKE sorteret, så testen måler faktisk noget.
    const raa = PREMIER_LEAGUE_TEAMS_2026.map((t) => t.vis || t.name);
    expect(raa).not.toEqual([...raa].sort((a, b) => a.localeCompare(b, 'da')));
  });

  // HVER BADGE SKAL SIGE HVILKET HOLD OG HVILKEN TRØJE. `title` kunne blive
  // holdets navn alene — eller forsvinde helt — uden en rød test, og så står
  // badgen uden tilgængeligt navn.
  it('navngiver hver badge med hold og trøje', () => {
    // ClubBadge lægger navnet i `aria-label`, ikke i et title-ELEMENT — se
    // komponentens egen kommentar om, hvorfor et <title> ville skrive
    // holdnavnet ind i dokumentet to gange.
    const { getByLabelText } = render(<TroejeOversigt game={SPIL(PREMIER_LEAGUE_TEAMS_2026, 'PL')} />);
    expect(getByLabelText('Hull City – 3. trøje')).toBeTruthy();
    expect(getByLabelText('Hull City – Hjemme')).toBeTruthy();
  });

  // MØNSTER OG SEKUNDÆRFARVE SKAL NÅ UD PÅ BADGEN. `color2`/`moenster`/`aerme`
  // kunne fjernes fra ClubBadge-kaldet uden en rød test — og så forsvandt alle
  // de mønstre, #133 målte frem, fra oversigten.
  it('tegner mønsteret på de hold, der har et', () => {
    const { container } = render(<TroejeOversigt game={SPIL(SUPERLIGA_TEAMS_2026)} />);
    // Randers' hjemmetrøje har et marineblåt skråbånd — en polygon i badgen.
    const r = raekke(container, 'Randers FC');
    expect(r.querySelectorAll('polygon').length).toBeGreaterThan(0);
    // …og et ensfarvet hold har ingen.
    expect(raekke(container, 'Viborg FF').querySelectorAll('polygon')).toHaveLength(0);
  });

  // EKSEMPLET SKAL FØLGE ADMIN-RETTEDE FARVER som resten af siden.
  //
  // TESTEN RENDRER KOMPONENTEN og læser den VISTE tekst. En test, der kaldte
  // `findEksempel` direkte med to forskellige `styles`, beviser kun, at
  // funktionen bruger sit argument — komponentens kaldested kunne stadig sende
  // `{}` afsted, og mutationen `findEksempel(hold, {})` var netop grøn.
  it('regner eksemplet med spillets teamStyles', () => {
    const vis = (spil) => render(<TroejeOversigt game={spil} />)
      .container.querySelector('.troejer__hjaelp').textContent;
    const uden = vis(SPIL(SUPERLIGA_TEAMS_2026));
    // En override, der gør AGF sort, ændrer hvilke par der clasher.
    const med = vis({ ...SPIL(SUPERLIGA_TEAMS_2026), teamStyles: { AGF: { color: '#0B0807' } } });
    expect(med).not.toBe(uden);
    // …og den viste tekst skal svare til det, reglen giver med de farver.
    const e = findEksempel(SUPERLIGA_TEAMS_2026, { AGF: { color: '#0B0807' } });
    expect(med.replace(/\s+/g, ' ')).toContain(`${e.hjemme}–${e.ude}`);
  });

  it('viser alle spillets hold', () => {
    const { container } = render(<TroejeOversigt game={SPIL(SUPERLIGA_TEAMS_2026)} />);
    expect(container.querySelectorAll('.troejer__hold')).toHaveLength(12);
  });

  it('viser tre trøjer pr. hold', () => {
    const { container } = render(<TroejeOversigt game={SPIL(SUPERLIGA_TEAMS_2026)} />);
    for (const r of container.querySelectorAll('.troejer__hold')) {
      expect(r.querySelectorAll('svg')).toHaveLength(3);
    }
  });

  // BÆRENDE: samme kilde som kampkortet. Læste oversigten rådata, ville en
  // admin-rettet farve ikke slå igennem her.
  it('følger en farve, ejeren har rettet i admin', () => {
    const spil = { ...SPIL(SUPERLIGA_TEAMS_2026), teamStyles: { 'Brøndby IF': { color: '#123456' } } };
    const { container } = render(<TroejeOversigt game={spil} />);
    const r = raekke(container, 'Brøndby IF');
    expect(r).not.toBeNull();
    const fyld = [...r.querySelectorAll('path')].map((e) => e.getAttribute('fill'));
    expect(fyld).toContain('#123456');
    // …og standardfarven må så ikke stå der.
    expect(fyld).not.toContain('#E5B905');
  });

  it('bruger visningsnavnet, ikke det lange navn', () => {
    const { container } = render(<TroejeOversigt game={SPIL(SUPERLIGA_TEAMS_2026)} />);
    const navne = [...container.querySelectorAll('.troejer__navn')].map((e) => e.textContent);
    expect(navne).toContain('Nordsjælland');
    expect(navne).not.toContain('FC Nordsjælland');
  });

  // Gaten er på spiltypen. Et Tour-spil har ingen fodboldhold, og `teamsOf`
  // ville ellers levere Superligaens tolv.
  it.each([
    ['tour', { id: 't', type: 'tour', teams: [] }],
    ['uden type', { id: 'x', teams: SUPERLIGA_TEAMS_2026 }],
  ])('vises ikke i et %s-spil', (_n, game) => {
    const { container } = render(<TroejeOversigt game={game} />);
    expect(container.querySelector('.troejer')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PLADSHOLDERE SKAL SIGES HØJT.
// ---------------------------------------------------------------------------
describe('3. trøjer, der aldrig bliver brugt', () => {
  it('markerer Hull Citys, som er magen til udetrøjen', () => {
    const { container } = render(<TroejeOversigt game={SPIL(PREMIER_LEAGUE_TEAMS_2026, 'PL')} />);
    const r = raekke(container, 'Hull City');
    expect(r).not.toBeNull();
    expect(r.textContent).toMatch(/3\. trøje · bruges aldrig/);
  });

  // LEEDS ER DEN, DEN GAMLE REGEL OVERSÅ. Deres to gule ligger 27 fra hinanden
  // — over den gamle tærskel på 20 — men tredjetrøjen vinder aldrig mod nogen
  // modstander, og feltet er derfor lige så dødt som Hulls.
  it('markerer Leeds, som en farvetærskel ville have overset', () => {
    const { container } = render(<TroejeOversigt game={SPIL(PREMIER_LEAGUE_TEAMS_2026, 'PL')} />);
    expect(raekke(container, 'Leeds United').textContent).toMatch(/bruges aldrig/);
    const leeds = PREMIER_LEAGUE_TEAMS_2026.find((t) => t.name === 'Leeds United');
    expect(colorDistance(leeds.awayColor, leeds.thirdColor)).toBeGreaterThan(20);
  });

  // …OG DE TO, DEN GAMLE REGEL MARKEREDE FALSKT. Coventrys og Palaces
  // 3. trøjer BLIVER brugt; Palaces lå kun tæt på holdets egen HJEMMEfarve,
  // som `matchBadges` aldrig sammenligner tredjefarven med.
  it.each(['Coventry City', 'Crystal Palace'])('markerer IKKE %s', (navn) => {
    const { container } = render(<TroejeOversigt game={SPIL(PREMIER_LEAGUE_TEAMS_2026, 'PL')} />);
    expect(raekke(container, navn).textContent).not.toMatch(/bruges aldrig/);
  });

  it('markerer ikke et hold med en 3. trøje, der bruges', () => {
    const { container } = render(<TroejeOversigt game={SPIL(SUPERLIGA_TEAMS_2026)} />);
    expect(raekke(container, 'Randers FC').textContent).not.toMatch(/bruges aldrig/);
  });

  it('markerer præcis de hold, hvis 3. trøje aldrig vælges', () => {
    const { container } = render(<TroejeOversigt game={SPIL(PREMIER_LEAGUE_TEAMS_2026, 'PL')} />);
    const markeret = [...container.querySelectorAll('.troejer__hold')]
      .filter((e) => e.textContent.includes('bruges aldrig'))
      .map((e) => e.querySelector('.troejer__navn').textContent)
      .sort();
    expect(markeret).toEqual(['Hull City', 'Leeds United']);
  });

  it('markerer ingen i Superligaen', () => {
    const { container } = render(<TroejeOversigt game={SPIL(SUPERLIGA_TEAMS_2026)} />);
    expect(container.textContent).not.toMatch(/bruges aldrig/);
  });

  // MODPRØVEN PÅ SELVE REGLEN: den skal svare det samme som at spørge
  // `matchBadges` direkte. Ellers er markeringen en anden regel end den, der
  // afgør kampkortet — og så er vi tilbage ved en opfundet tærskel.
  it.each([
    ['Superligaen', SUPERLIGA_TEAMS_2026],
    ['Premier League', PREMIER_LEAGUE_TEAMS_2026],
  ])('svarer det samme som at spørge matchBadges (%s)', (_n, teams) => {
    const via = ubrugteTredjetroejer(teams, {});
    for (const a of teams) {
      const tredje = badgeFor(teams, a.name, {}, 'third').color;
      const ude = badgeFor(teams, a.name, {}, 'away').color;
      const brugt = tredje !== ude && teams.some((h) => h.name !== a.name
        && matchBadges(teams, h.name, a.name, {}).a.color === tredje);
      expect(via.has(a.name), a.name).toBe(!brugt);
    }
  });
});

// ---------------------------------------------------------------------------
// EKSEMPLET SKAL VÆRE SANDT — det er regnet ud af spillets egne hold.
//
// Et håndskrevet eksempel bliver forkert, næste gang en farve rettes. Det er
// præcis sket for de tal, der begrundede badge-mønstrene.
// ---------------------------------------------------------------------------
describe('eksemplet på tredjetrøje-skiftet', () => {
  it.each([
    ['Superligaen', SUPERLIGA_TEAMS_2026],
    ['Premier League', PREMIER_LEAGUE_TEAMS_2026],
  ])('peger på et par, der FAKTISK skifter (%s)', (_n, teams) => {
    const e = findEksempel(teams, {});
    expect(e).not.toBeNull();
    // Slå parret op igen gennem den ægte regel og kræv, at udeholdet ikke
    // tegnes i sin udefarve.
    const hjemme = teams.find((t) => (t.vis || t.name) === e.hjemme);
    const ude = teams.find((t) => (t.vis || t.name) === e.ude);
    const { a } = matchBadges(teams, hjemme.name, ude.name, {});
    const udeFarve = badgeFor(teams, ude.name, {}, 'away');
    const tredje = badgeFor(teams, ude.name, {}, 'third');
    expect(a.color).not.toBe(udeFarve.color);
    expect(a.color).toBe(tredje.color);
  });

  // UAFGJORT MÅ IKKE AFHÆNGE AF RÆKKEFØLGEN. AGF og F.C. København spiller
  // begge i #FFFFFF, så flere par giver præcis samme gevinst — og før afgjorde
  // listens rækkefølge svaret. Komponenten sorterer på visningsnavn, testen
  // gjorde ikke, og de to fik hver sit eksempel.
  it.each([
    ['som givet', (t) => t],
    ['sorteret', (t) => [...t].sort((a, b) => (a.vis || a.name).localeCompare(b.vis || b.name, 'da'))],
    ['omvendt', (t) => [...t].reverse()],
  ])('giver samme eksempel, uanset rækkefølge (%s)', (_n, orden) => {
    const a = findEksempel(SUPERLIGA_TEAMS_2026, {});
    const b = findEksempel(orden(SUPERLIGA_TEAMS_2026), {});
    expect(`${b.hjemme}–${b.ude}`).toBe(`${a.hjemme}–${a.ude}`);
  });

  it('vælger det par, hvor skiftet gør MEST forskel', () => {
    const e = findEksempel(SUPERLIGA_TEAMS_2026, {});
    // Gevinsten er, hvor meget længere væk tredjefarven ligger fra
    // hjemmeholdets end udefarven gør. Ingen andre par må have en større.
    let maks = -Infinity;
    for (const h of SUPERLIGA_TEAMS_2026) {
      for (const a of SUPERLIGA_TEAMS_2026) {
        if (h.name === a.name) continue;
        const valgt = matchBadges(SUPERLIGA_TEAMS_2026, h.name, a.name, {}).a;
        const raa = badgeFor(SUPERLIGA_TEAMS_2026, a.name, {}, 'away');
        if (valgt.color === raa.color) continue;
        const hj = badgeFor(SUPERLIGA_TEAMS_2026, h.name, {}, 'home');
        maks = Math.max(maks, colorDistance(valgt.color, hj.color) - colorDistance(raa.color, hj.color));
      }
    }
    expect(e.gevinst).toBeCloseTo(maks, 6);
  });

  it('nævner parret i den viste tekst', () => {
    const { container } = render(<TroejeOversigt game={SPIL(SUPERLIGA_TEAMS_2026)} />);
    const e = findEksempel(SUPERLIGA_TEAMS_2026, {});
    expect(container.querySelector('.troejer__hjaelp').textContent)
      .toContain(`${e.hjemme}–${e.ude}`);
  });
});

// ---------------------------------------------------------------------------
// TEKSTEN HANDLER OM BADGEN, IKKE OM TRØJEN PÅ BANEN.
//
// Skriver vi "holdet spiller i", modsiger vi tv-billedet: reglen afgør kun,
// hvilken farve KORTET tegner udeholdet i.
// ---------------------------------------------------------------------------
describe('forklaringen', () => {
  it('taler om kampkortet og ikke om hvad klubben spiller i', () => {
    const { container } = render(<TroejeOversigt game={SPIL(SUPERLIGA_TEAMS_2026)} />);
    const t = container.querySelector('.troejer__hjaelp').textContent;
    expect(t).toMatch(/kampkortet/);
    expect(t).toMatch(/skifter til 3\. trøje/);
    expect(t).not.toMatch(/spiller i/);
  });

  // OG DEN MÅ IKKE LOVE, AT DE TO BADGES KAN SKELNES. `matchBadges` skifter kun,
  // HVIS tredjefarven ligger længere væk — hjælper ingen af dem, bliver
  // udetrøjen stående. Modbeviset står på samme skærm: Hull City.
  it('lover ikke, at de to badges altid kan skelnes', () => {
    const { container } = render(<TroejeOversigt game={SPIL(SUPERLIGA_TEAMS_2026)} />);
    const t = container.querySelector('.troejer__hjaelp').textContent;
    expect(t).not.toMatch(/så de to badges kan skelnes/);
    expect(t).toMatch(/hvis den ligger længere/);
    expect(t).toMatch(/bliver udetrøjen stående/);
  });

  // DET ER UDEHOLDET, DER SKIFTER. Teksten kunne vendes på hovedet — "Hjemme-
  // holdet vises… når udefarven ligger for LANGT fra… så de to badges IKKE kan
  // skelnes" — og bestå, fordi der kun blev bundet to løsrevne fraser.
  it('siger, at det er UDEHOLDET der skifter', () => {
    const { container } = render(<TroejeOversigt game={SPIL(SUPERLIGA_TEAMS_2026)} />);
    const t = container.querySelector('.troejer__hjaelp').textContent;
    expect(t).toMatch(/vises udeholdet i sin udetrøje/i);
    expect(t).not.toMatch(/hjemmeholdet vises/i);
    expect(t).not.toMatch(/ikke kan skelnes/);
  });

  // EKSEMPLETS HALE VAR UBUNDET: "…dér tegnes X i 3. trøje" kunne blive til
  // "…dér tegnes Y i hjemmetrøje" eller "…dér tegnes IKKE", fordi kun parret
  // før bindestregen blev asserteret.
  it('siger, at UDEHOLDET tegnes i 3. trøje i eksemplet', () => {
    const { container } = render(<TroejeOversigt game={SPIL(SUPERLIGA_TEAMS_2026)} />);
    const e = findEksempel(SUPERLIGA_TEAMS_2026, {});
    const t = container.querySelector('.troejer__hjaelp').textContent.replace(/\s+/g, ' ');
    expect(t).toContain(`${e.hjemme}–${e.ude}: dér tegnes ${e.ude} i 3. trøje`);
    expect(t).not.toMatch(/tegnes IKKE/);
  });

  // LAYOUTET LEVER I CSS, og jsdom anvender ingen CSS — markuppen alene beviser
  // intet. Hele blokken kunne slettes fra theme.css med 2155 grønne tests, og
  // dermed også 620 px-brydepunktet, som kommentaren dér bruger ti linjer på at
  // begrunde. Samme greb som `FootballTip.test.jsx` bruger på spejlvendingen.
  it('har CSS, der giver navnet sin egen linje under 620 px', () => {
    const her = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(her, '../../../styles/theme.css'), 'utf8');
    const basis = css.match(/\.troejer__hold\s*\{([^}]*)\}/);
    expect(basis).not.toBeNull();
    // Under brydepunktet: én kolonne, altså navnet på egen linje.
    expect(basis[1]).toMatch(/grid-template-columns:\s*1fr/);
    // …og fra 620 px en navnekolonne ved siden af trøjerne.
    const bred = css.match(/@media \(min-width: 620px\) \{\s*\.troejer__hold\s*\{([^}]*)\}/);
    expect(bred).not.toBeNull();
    expect(bred[1]).toMatch(/grid-template-columns:\s*10rem 1fr/);
  });
});
