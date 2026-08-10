// ---------------------------------------------------------------------------
// TRØJEOVERSIGTEN — alle spillets hold med deres tre trøjer.
//
// Den skal vise trøjerne, som KAMPKORTET ville tegne dem. Går den uden om
// `badgeFor`, kan et hold stå i én farve her og en anden på kortet, så snart
// ejeren har rettet en farve i admin — præcis den fejl, spilprofilens egen
// trøje havde, indtil den blev lagt om.
//
// OG DEN MÅ IKKE PÅSTÅ, AT ET HOLD HAR TRE TRØJER, NÅR DET IKKE HAR. Hull City
// står med #FFFFFF som både ude og 3.; uden en markering ville siden vise to
// ens hvide badges og se ud som en oplysning.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import TroejeOversigt, { findEksempel, SAMME_FARVE } from './TroejeOversigt';
import { matchBadges, badgeFor } from './badges';
import { SUPERLIGA_TEAMS_2026 } from '../../../data/superligaTeams2026';
import { PREMIER_LEAGUE_TEAMS_2026 } from '../../../data/premierLeagueTeams2026';
import { colorDistance } from '../../../lib/contrastText';

const SPIL = (teams, navn = 'Superligaen') => ({ id: 'g', type: 'football', name: navn, teams });

/** Rækken for ét hold. */
const raekke = (c, navn) => [...c.querySelectorAll('.troejer__hold')]
  .find((e) => e.querySelector('.troejer__navn')?.textContent === navn) || null;

describe('trøjeoversigten', () => {
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
describe('trøjer, der ikke findes', () => {
  it('markerer Hull Citys 3. trøje, som er magen til udetrøjen', () => {
    const { container } = render(<TroejeOversigt game={SPIL(PREMIER_LEAGUE_TEAMS_2026, 'PL')} />);
    const r = raekke(container, 'Hull City');
    expect(r).not.toBeNull();
    expect(r.textContent).toMatch(/3\. trøje · mangler, viser ude/);
    // MODPRØVEN PÅ DATAEN: markeringen skal skyldes farverne, ikke en hårdkodet
    // liste over klubnavne.
    const hull = PREMIER_LEAGUE_TEAMS_2026.find((t) => t.name === 'Hull City');
    expect(colorDistance(hull.awayColor, hull.thirdColor)).toBeLessThan(SAMME_FARVE);
  });

  // …og et hold med tre forskellige trøjer må IKKE markeres. Uden den her
  // ville en komponent, der altid skrev "mangler", bestå testen ovenfor.
  it('markerer ikke et hold med tre forskellige trøjer', () => {
    const { container } = render(<TroejeOversigt game={SPIL(SUPERLIGA_TEAMS_2026)} />);
    const r = raekke(container, 'Randers FC');
    expect(r).not.toBeNull();
    expect(r.textContent).not.toMatch(/mangler/);
  });

  it('markerer præcis de hold, hvis farver falder sammen', () => {
    const { container } = render(<TroejeOversigt game={SPIL(PREMIER_LEAGUE_TEAMS_2026, 'PL')} />);
    const markeret = [...container.querySelectorAll('.troejer__hold')]
      .filter((e) => e.textContent.includes('mangler'))
      .map((e) => e.querySelector('.troejer__navn').textContent)
      .sort();
    // De tre er kendt gæld i PL — se `badgeFarver.test.js`. Bliver listen
    // længere, er en farve gået i stykker; bliver den kortere, er gælden
    // betalt, og så skal begge tests opdateres bevidst.
    expect(markeret).toEqual(['Coventry City', 'Crystal Palace', 'Hull City']);
  });

  it('markerer ingen i Superligaen', () => {
    const { container } = render(<TroejeOversigt game={SPIL(SUPERLIGA_TEAMS_2026)} />);
    expect(container.textContent).not.toMatch(/mangler/);
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
});
