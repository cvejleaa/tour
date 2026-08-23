// ---------------------------------------------------------------------------
// INGEN KAMP MÅ VISE TO BADGES I SAMME FARVE.
//
// Kampkortet tegner hjemmeholdet i hjemmefarve og udeholdet i udefarve — og
// skifter til udeholdets tredjefarve, hvis udefarven ligger for tæt på. Reglen
// var udækket, og den kunne slettes helt (`a = third` uden betingelse) med hele
// suiten grøn.
//
// DEN FEJL, FILEN ER SKREVET EFTER. Elleve ude- og tredjefarver blev målt på
// klubbernes egne trøjer. Silkeborgs tredjefarve gik fra blå til lyserød — og
// da deres UDEtrøje også er hvid, stod FCK–Silkeborg og AGF–Silkeborg pludselig
// med to fuldstændig ens hvide badges. Afstand 0. Ingen af de 2000 tests sagde
// fra, fordi ingen af dem kørte parrene igennem reglen.
//
// Testen bruger den ÆGTE `matchBadges` fra `badges.js`, ikke en kopi. En kopi
// ville drive fra originalen, og så ville den bevise noget om sig selv.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { matchBadges } from './badges';
import { SUPERLIGA_TEAMS_2026 } from '../../../data/superligaTeams2026';
import { PREMIER_LEAGUE_TEAMS_2026 } from '../../../data/premierLeagueTeams2026';
import { colorDistance } from '../../../lib/contrastText';

/** Alle hjemme/ude-par i en liga, som de ville blive tegnet på et kampkort. */
function alleKampe(teams) {
  const ud = [];
  for (const h of teams) {
    for (const a of teams) {
      if (h.name === a.name) continue;
      const { h: hb, a: ab } = matchBadges(teams, h.name, a.name, {});
      ud.push({ hjemme: h.name, ude: a.name, afstand: colorDistance(ab.color, hb.color) });
    }
  }
  return ud;
}

/**
 * PAR, HVOR BEGGE UDEFARVER LIGGER TÆT PÅ HJEMMEHOLDETS.
 *
 * Reglen vælger den fjerneste af ude- og tredjefarven, men kan ikke opfinde en
 * farve, klubben ikke har. Listen står EKSPLICIT, så et nyt tæt par bliver rødt
 * i stedet for at gemme sig i et gennemsnit — og så man kan se, om et hold
 * mangler en brugbar tredjefarve.
 *
 * Alle elleve er over 80 i afstand, altså tydeligt forskellige nuancer. Det er
 * `colorsClash`-tærsklen på 120, de ikke når — ikke grænsen for at kunne skelnes.
 */
const TAETTE_PAR_SUPERLIGA = [
  'FC Midtjylland vs Brøndby IF',
  'F.C. København vs Silkeborg IF',
  'AGF vs Silkeborg IF',
  'FC Nordsjælland vs Sønderjyske Fodbold',
  'Viborg FF vs Brøndby IF',
  'Viborg FF vs AGF',
  'Sønderjyske Fodbold vs Silkeborg IF',
  'Silkeborg IF vs Sønderjyske Fodbold',
  'Lyngby Boldklub vs Brøndby IF',
];

describe('kampkortets badge-farver — Superligaen', () => {
  const kampe = alleKampe(SUPERLIGA_TEAMS_2026);

  it('dækker alle 132 hjemme/ude-par', () => {
    expect(kampe).toHaveLength(12 * 11);
  });

  // BÆRENDE. Distance 0 er to identiske badges — samme kamp, to ens trøjer.
  // Det var virkeligheden for FCK–Silkeborg og AGF–Silkeborg, før reglen blev
  // rettet til at vælge den fjerneste frem for at falde tilbage på udefarven.
  it('viser aldrig to badges, der ikke kan skelnes', () => {
    const slemme = kampe.filter((k) => k.afstand < 80);
    expect(slemme.map((k) => `${k.hjemme} vs ${k.ude} (${Math.round(k.afstand)})`)).toEqual([]);
  });

  // Og listen over dem UNDER clash-tærsklen skal være præcis den kendte.
  // Bliver den længere, har en ny farve gjort skade; bliver den kortere, er et
  // hold blevet lettere at skelne — begge dele skal ses, ikke sluges.
  it('har præcis de kendte tætte par — hverken flere eller færre', () => {
    const taette = kampe.filter((k) => k.afstand < 120).map((k) => `${k.hjemme} vs ${k.ude}`);
    expect(taette.sort()).toEqual([...TAETTE_PAR_SUPERLIGA].sort());
  });

  // MODPRØVEN på selve reglen: uden skiftet til tredjefarven ville der findes
  // par med to ens badges. Består den her, uden at reglen gør noget, er hele
  // testen dekoration.
  it('bruger faktisk tredjefarven — uden den ville nogen kampe stå ens', () => {
    const udenSkift = [];
    for (const h of SUPERLIGA_TEAMS_2026) {
      for (const a of SUPERLIGA_TEAMS_2026) {
        if (h.name === a.name) continue;
        udenSkift.push(colorDistance(a.awayColor, h.color));
      }
    }
    // Rå udefarve mod hjemmefarve giver mindst ét par på 0 (hvid mod hvid).
    expect(Math.min(...udenSkift)).toBeLessThan(80);
    // Med reglen er bunden løftet.
    expect(Math.min(...kampe.map((k) => k.afstand))).toBeGreaterThanOrEqual(80);
  });
});

// ---------------------------------------------------------------------------
// PREMIER LEAGUE HAR SAMME FEJL, OG DEN ER IKKE RETTET HER.
//
// Testen ovenfor blev skrevet til Superligaen og afslørede med det samme, at PL
// har ti par under 80 — værst Leeds–Hull på 0,0, altså to fuldstændig ens hvide
// badges. Årsagen er data, ikke reglen:
//
//   Hull City      awayColor #FFFFFF   thirdColor #FFFFFF   ← samme farve to gange
//   Coventry City  awayColor #F6F4F3   thirdColor #FFFFFF   ← begge næsten hvide
//
// Et hold, hvis ude- og tredjefarve er ens, har intet at skifte til. Det er en
// pladsholder, ikke en trøje — PL's ude- og tredjefarver er aldrig blevet målt,
// præcis som Superligaens ikke var før #133.
//
// DEN BLIVER IKKE RETTET I DENNE OMGANG, fordi en rigtig rettelse kræver, at de
// tyve klubbers ude- og tredjetrøjer måles, og fordi PL-spillet ikke er begyndt
// endnu (21. august). Listen står derfor eksplicit, så fejlen er SYNLIG og et
// nyt par bliver rødt — og så den kan lukkes med samme metode som Superligaens.
// ---------------------------------------------------------------------------
describe('kampkortets badge-farver — Premier League (kendt gæld)', () => {
  const kampe = alleKampe(PREMIER_LEAGUE_TEAMS_2026);

  it('dækker alle 380 hjemme/ude-par', () => {
    expect(kampe).toHaveLength(20 * 19);
  });

  // Antallet er låst, så en rettelse af PL-farverne SKAL opdatere den her — og
  // så ingen kan tilføje et nyt uskelneligt par uden at se det.
  it('har præcis ti par, der ikke kan skelnes — indtil PL-trøjerne måles', () => {
    const slemme = kampe.filter((k) => k.afstand < 80);
    expect(slemme).toHaveLength(10);
    // Alle ti skyldes de to hold, hvis ude- og tredjefarve er den samme.
    expect([...new Set(slemme.map((k) => k.ude))].sort()).toEqual(['Coventry City', 'Hull City']);
  });

  // ÅRSAGEN, sagt direkte. Falder den her, er dataene rettet, og så skal
  // testen ovenfor opdateres — ikke omvendt.
  it.each(['Hull City', 'Coventry City'])('%s har stadig ude og tredje i samme nuance', (navn) => {
    const t = PREMIER_LEAGUE_TEAMS_2026.find((x) => x.name === navn);
    expect(colorDistance(t.awayColor, t.thirdColor)).toBeLessThan(20);
  });
});

// ---------------------------------------------------------------------------
// EN FORÆLDET HOLDLISTE ER USYNLIG I FLADEN — og det er dét, der gør den farlig.
//
// Ejeren så Randers stå i marine på kampkortet i udekampen mod FC Midtjylland,
// selv om de spillede i den orange tredjetrøje. Årsagen lå ikke i reglen, men i
// DATAENE: `games/{id}.teams` i produktionen kan være ældre end holdlisten her
// i repoet, og ingen frontend-test kan se det — testene kører jo på repoets
// liste. Denne blok binder derfor de to tilstande fast, så mekanismen står
// beskrevet i kode i stedet for i en commit-besked.
//
// Bemærk især den anden test: den GAMLE tredjefarve giver præcis det samme
// syn som en manglende. Reproducerer man kun den ene, tror man, man har bevist
// hvilken tilstand produktionen er i — og det har man ikke.
// ---------------------------------------------------------------------------

describe('en manglende tredjefarve kan ikke ses — kun måles', () => {
  const FCM = 'FC Midtjylland';
  const RFC = 'Randers FC';
  const udeblevet = (teams, navn, felt) => teams.map((t) => {
    if (t.name !== navn) return t;
    const kopi = { ...t };
    delete kopi[felt];
    return kopi;
  });

  it('vælger den ORANGE tredjetrøje med en komplet holdliste', () => {
    const valgt = matchBadges(SUPERLIGA_TEAMS_2026, FCM, RFC, {}).a.color;
    expect(valgt).toBe('#FC8033');
  });

  it('falder tilbage på UDETRØJEN, når thirdColor mangler', () => {
    // `badgeFor` falder tilbage thirdColor || awayColor || color, så tredje
    // bliver lig med ude — og `matchBadges` sammenligner en værdi med sig selv.
    // `>` er strengt, så 95,3 > 95,3 er falsk, og udetrøjen bliver stående,
    // uanset hvor meget den clasher.
    const uden = udeblevet(SUPERLIGA_TEAMS_2026, RFC, 'thirdColor');
    const valgt = matchBadges(uden, FCM, RFC, {}).a.color;
    expect(valgt).toBe('#33384F');
    expect(valgt).not.toBe('#FC8033');
  });

  it('giver SAMME syn med den gamle, målt-væk tredjefarve — to tilstande, ét symptom', () => {
    // #003C7E er den værdi, superligaTeams2026.test.js vogter mod at snige sig
    // tilbage. Her VINDER den (afstand 130,3 > udetrøjens 95,3) og er alligevel
    // marineblå. En reproduktion af den manglende farve beviser derfor ikke,
    // at produktionen er i dén tilstand — begge ser ens ud på skærmen.
    const gammel = SUPERLIGA_TEAMS_2026.map((t) => (
      t.name === RFC ? { ...t, thirdColor: '#003C7E' } : t));
    const valgt = matchBadges(gammel, FCM, RFC, {}).a.color;
    expect(valgt).toBe('#003C7E');
    const hjemme = matchBadges(gammel, FCM, RFC, {}).h.color;
    // Den vinder, fordi den er FJERNEST — ikke fordi den er pæn.
    expect(colorDistance('#003C7E', hjemme)).toBeGreaterThan(colorDistance('#33384F', hjemme));
  });

  it('rammer 35 af Superligaens 132 par, ikke kun Randers', () => {
    // Målt af scripts/troeje-raekkevidde.mjs (npx vite-node). Tallet står her,
    // fordi "kun ét kampkort" var det svar, der lå lige for — og det er
    // forkert: `matchBadges` vælger den fjerneste, så en tredjefarve slår
    // igennem i par, der intet har med det hold at gøre, man kiggede på.
    const uden = SUPERLIGA_TEAMS_2026.map((t) => udeblevet([t], t.name, 'thirdColor')[0]);
    let skift = 0;
    let par = 0;
    for (const h of SUPERLIGA_TEAMS_2026) {
      for (const a of SUPERLIGA_TEAMS_2026) {
        if (h.name === a.name) continue;
        par += 1;
        if (matchBadges(uden, h.name, a.name, {}).a.color
          !== matchBadges(SUPERLIGA_TEAMS_2026, h.name, a.name, {}).a.color) skift += 1;
      }
    }
    expect(par).toBe(132);
    expect(skift).toBe(35);
  });
});
