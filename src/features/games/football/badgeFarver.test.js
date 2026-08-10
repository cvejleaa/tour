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
// Testen bruger den ÆGTE `matchBadges` fra FootballTip, ikke en kopi. En kopi
// ville drive fra originalen, og så ville den bevise noget om sig selv.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { matchBadges } from './FootballTip';
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
