/**
 * Tests for visningsnavnet.
 *
 * Det farlige her er ikke, at et navn ser forkert ud — det er, at nogen retter
 * `name` for at få skærmen til at passe. `name` er den EKSAKTE streng fra
 * pulselive og api.superliga.dk, og `teamElo()` falder TAVST tilbage til 1500
 * for et navn, den ikke kender. Testene holder derfor fast i, at visningsnavnet
 * er et EKSTRA felt og aldrig erstatter nøglen.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  VISNINGSNAVN, standardVisningsnavn, visningsnavn, medVisningsnavn, MAKS_VISNINGSNAVN,
} from './visningsnavn';
import { PREMIER_LEAGUE_TEAMS_2026 } from '../../../data/premierLeagueTeams2026';
import { SUPERLIGA_TEAMS_2026 } from '../../../data/superligaTeams2026';

describe('husets forslag', () => {
  // De fire er valgt, fordi de sparer en linje på en telefon — målt med
  // scripts/navnbredde.mjs. Brighton er det ENESTE navn, der ellers klippes.
  it.each([
    ['Brighton and Hove Albion', 'Brighton'],
    ['Tottenham Hotspur', 'Tottenham'],
    ['Sønderjyske Fodbold', 'Sønderjyske'],
    ['FC Nordsjælland', 'Nordsjælland'],
  ])('%s vises som %s', (navn, vis) => {
    expect(standardVisningsnavn(navn)).toBe(vis);
  });

  // Og de øvrige skal stå uændret. Et visningsnavn, der ikke sparer plads,
  // er støj — og en forkortelse, spillerne ikke kan tyde, var hele problemet.
  it.each(['Arsenal', 'Manchester United', 'AGF', 'OB', 'Randers FC'])(
    '%s står uændret', (navn) => {
      expect(standardVisningsnavn(navn)).toBe(navn);
    },
  );

  it('holder listen kort — kun de navne, der faktisk sparer plads', () => {
    expect(Object.keys(VISNINGSNAVN)).toHaveLength(4);
  });
});

describe('spillets egen override', () => {
  it('vinder over husets forslag', () => {
    expect(visningsnavn({ 'Tottenham Hotspur': { visningsnavn: 'Spurs' } }, 'Tottenham Hotspur'))
      .toBe('Spurs');
  });

  it('bruges også på et hold uden forslag', () => {
    expect(visningsnavn({ Arsenal: { visningsnavn: 'The Gunners' } }, 'Arsenal')).toBe('The Gunners');
  });

  // EN TOM OVERRIDE ER IKKE ET NAVN. Ryddede nogen feltet i stedet for at
  // trykke nulstil, ville holdet ellers komme til at hedde ingenting.
  it.each(['', '   ', null, undefined])('falder tilbage på forslaget ved %p', (v) => {
    expect(visningsnavn({ 'Tottenham Hotspur': { visningsnavn: v } }, 'Tottenham Hotspur'))
      .toBe('Tottenham');
  });

  it('trimmer mellemrum', () => {
    expect(visningsnavn({ Arsenal: { visningsnavn: '  Gunners  ' } }, 'Arsenal')).toBe('Gunners');
  });

  it('klarer sig uden teamStyles overhovedet', () => {
    expect(visningsnavn(null, 'Brighton and Hove Albion')).toBe('Brighton');
    expect(visningsnavn(undefined, 'Arsenal')).toBe('Arsenal');
  });

  // TYPE-VAGTEN ER IKKE PEDANTERI. Firestore gemmer, hvad der bliver skrevet,
  // og `firestore.rules` validerer ikke indholdet af hvert enkelt felt.
  // Et OBJEKT i feltet giver "Objects are not valid as a React child" — altså
  // hvidt skærmbillede for ALLE i spillet, ikke bare et grimt navn. Uden
  // `typeof o === 'string'` er det ét felt fra en admin-fejl væk.
  it.each([
    ['et objekt', { noget: 1 }],
    ['en liste', ['Brighton']],
    ['et tal', 42],
    ['en boolean', true],
  ])('ignorerer %s og falder tilbage på forslaget', (_, v) => {
    expect(visningsnavn({ 'Tottenham Hotspur': { visningsnavn: v } }, 'Tottenham Hotspur'))
      .toBe('Tottenham');
  });

  // LOFTET LIGGER HER, IKKE I INPUTTET. Rules-sproget har ingen "for alle"-
  // operator over en liste, så længden af hvert visningsnavn kan ikke tjekkes
  // på serveren; `maxLength={40}` i admin-fladen kan omgås ved at skrive
  // direkte i Firestore-konsollen. Et navn på 10 000 tegn nåede før DOM'en i
  // fuld længde, og hverken `.mytips__match` eller `.sltab__name` klipper i
  // CSS — én række kunne altså vokse til hundredvis af linjer for alle.
  it('klipper et absurd langt navn', () => {
    const langt = 'A'.repeat(10000);
    const ud = visningsnavn({ Arsenal: { visningsnavn: langt } }, 'Arsenal');
    expect(ud).toHaveLength(MAKS_VISNINGSNAVN);
    expect(ud).toBe('A'.repeat(MAKS_VISNINGSNAVN));
  });

  // Modprøven: et navn PÅ grænsen må ikke klippes. Uden den ville et loft på
  // fx 3 tegn også bestå testen ovenfor.
  it('rører ikke et navn på præcis grænsen', () => {
    const lige = 'B'.repeat(MAKS_VISNINGSNAVN);
    expect(visningsnavn({ Arsenal: { visningsnavn: lige } }, 'Arsenal')).toBe(lige);
  });

  // GRÆNSEN SKAL VÆRE ET RIGTIGT TAL, ikke bare "sig selv".
  //
  // De to tests ovenfor bruger begge `MAKS_VISNINGSNAVN`, så de flytter sig
  // MED konstanten: sattes den til 3, ville de stadig bestå — og hvert eneste
  // holdnavn ville blive klippet til "Bri". Det er dét, testen her fanger.
  //
  // Kravet er ikke et bestemt tal, men at loftet ligger komfortabelt over det
  // længste navn, nogen kunne finde på at skrive. Det længste EKSAKTE navn i
  // de to ligaer er "Brighton and Hove Albion" (24 tegn) — og admin skal kunne
  // skrive mindst så meget, ellers kan man ikke engang gentage klubbens eget
  // navn i feltet.
  it('ligger komfortabelt over det længste rigtige holdnavn', () => {
    const alle = [...PREMIER_LEAGUE_TEAMS_2026, ...SUPERLIGA_TEAMS_2026].map((t) => t.name);
    const laengst = alle.reduce((a, b) => (b.length > a.length ? b : a));
    expect(laengst).toBe('Brighton and Hove Albion');
    expect(MAKS_VISNINGSNAVN).toBeGreaterThanOrEqual(laengst.length);
    // …men heller ikke så stort, at loftet holder op med at være et loft. En
    // tips-række uden klipning i CSS bliver ulæselig længe før 100 tegn.
    expect(MAKS_VISNINGSNAVN).toBeLessThanOrEqual(60);
  });

  // Og admin-feltets `maxLength` skal være DEN SAMME grænse. Var de to tal
  // sat hver for sig, kunne de drive fra hinanden, og så ville feltet lade dig
  // skrive et navn, appen bagefter klipper i — uden at sige det.
  it('er den grænse, admin-feltet selv bruger', () => {
    const her = dirname(fileURLToPath(import.meta.url));
    const kilde = readFileSync(resolve(her, '../../admin/TeamStylesTab.jsx'), 'utf8');
    expect(kilde).toContain('maxLength={MAKS_VISNINGSNAVN}');
    // Og ikke et løst 40-tal ved siden af. (`maxLength={7}` på farvefelterne er
    // et andet felt med sin egen, uafhængige grænse — den skal blive stående.)
    expect(kilde).not.toContain('maxLength={40}');
  });

  // Og et almindeligt navn skal selvfølgelig stå urørt.
  it('rører ikke et almindeligt navn', () => {
    expect(visningsnavn({ Arsenal: { visningsnavn: 'The Gunners' } }, 'Arsenal')).toBe('The Gunners');
  });

  // DET RÅ NAVN KLIPPES IKKE. Det kommer fra vores egen holdliste, og et
  // afkortet "Brighton and Hove Alb" ville være værre end det, der står.
  it('klipper ikke et langt holdnavn uden override', () => {
    expect(visningsnavn({}, 'Brighton and Hove Albion')).toBe('Brighton');
    expect(visningsnavn({}, 'Coventry City')).toBe('Coventry City');
  });
});

describe('medVisningsnavn', () => {
  const HOLD = [
    { name: 'Brighton and Hove Albion', short: 'BHA', elo: 1522 },
    { name: 'Arsenal', short: 'ARS', elo: 1664 },
  ];

  // BÆRENDE: `name` må ALDRIG erstattes. Bliver den det, mister holdet sin
  // Elo og sine resultater uden en eneste fejlbesked.
  it('lægger `vis` ved siden af `name` — ikke i stedet for', () => {
    const ud = medVisningsnavn(HOLD, null);
    expect(ud[0].name).toBe('Brighton and Hove Albion');
    expect(ud[0].vis).toBe('Brighton');
    expect(ud[1].name).toBe('Arsenal');
    expect(ud[1].vis).toBe('Arsenal');
  });

  it('bevarer alle øvrige felter', () => {
    const ud = medVisningsnavn(HOLD, null);
    expect(ud[0]).toMatchObject(HOLD[0]);
    expect(ud[1]).toMatchObject(HOLD[1]);
  });

  // CACHEN er ikke pynt: uden den giver hvert kald en ny liste, og hver
  // useMemo, der har den som dependency, regner forfra ved hver render.
  it('giver samme objekt igen ved samme input', () => {
    expect(medVisningsnavn(HOLD, null)).toBe(medVisningsnavn(HOLD, null));
  });

  // …men SKAL give en ny liste, når overrides ændrer sig. Ellers ville en
  // rettelse i admin ikke slå igennem, før siden blev genindlæst.
  it('giver en ny liste, når overrides ændrer sig', () => {
    const a = medVisningsnavn(HOLD, null);
    const b = medVisningsnavn(HOLD, { Arsenal: { visningsnavn: 'Gunners' } });
    expect(b).not.toBe(a);
    expect(b[1].vis).toBe('Gunners');
    // Og tilbage igen skal ramme cachen, ikke bygge en tredje liste.
    expect(medVisningsnavn(HOLD, null)).toBe(a);
  });

  it('lader en tom liste være', () => {
    expect(medVisningsnavn([], null)).toEqual([]);
    expect(medVisningsnavn(null, null)).toBeNull();
  });
});
