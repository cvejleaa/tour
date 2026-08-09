/**
 * Tests for Superligaens holddata.
 *
 * Der var ingen — hverken for Elo eller for farverne. Det betød, at seks af
 * de tolv holds hjemmefarve kunne være forkert i månedsvis uden et rødt tegn,
 * og det VAR de: farverne var skrevet fra hukommelsen om klubbernes farver, og
 * hukommelsen huskede klubfarven i stedet for trøjen.
 *
 * Hver rettelse herunder assertérer BÅDE den nye værdi og at den gamle,
 * forkerte er væk. Et bånd, der rummer begge, ville ikke måle noget.
 */
import { describe, it, expect } from 'vitest';
import { SUPERLIGA_TEAMS_2026, superligaEloMap, superligaTeamInfo } from './superligaTeams2026';

const hold = (navn) => SUPERLIGA_TEAMS_2026.find((t) => t.name === navn);

describe('Superligaen — listens form', () => {
  it('har præcis tolv hold', () => {
    expect(SUPERLIGA_TEAMS_2026).toHaveLength(12);
  });

  it('har entydige navne og kortkoder', () => {
    const navne = SUPERLIGA_TEAMS_2026.map((t) => t.name);
    const koder = SUPERLIGA_TEAMS_2026.map((t) => t.short);
    expect(new Set(navne).size).toBe(12);
    expect(new Set(koder).size).toBe(12);
  });

  it('har tre gyldige hex-farver på hvert hold', () => {
    for (const t of SUPERLIGA_TEAMS_2026) {
      for (const felt of ['color', 'awayColor', 'thirdColor']) {
        expect(t[felt], `${t.name}.${felt}`).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  });

  // En hjemmefarve, der er identisk med holdets egen udefarve, gør
  // clash-reglen indholdsløs: der er intet at skifte til.
  it('lader intet hold have samme hjemme- og udefarve', () => {
    for (const t of SUPERLIGA_TEAMS_2026) {
      expect(t.awayColor, t.name).not.toBe(t.color);
    }
  });
});

// ---------------------------------------------------------------------------
// DE SEKS RETTEDE. Kilden er fotos af de faktiske 2026/27-trøjer (bold.dk).
// Hver test navngiver den gamle værdi, så rettelsen ikke kan rulle tilbage
// ubemærket.
// ---------------------------------------------------------------------------
describe('hjemmefarver rettet efter fotos af 2026/27-trøjerne', () => {
  it('FCM er SORT med røde pinstriber — ikke ensfarvet rød', () => {
    const t = hold('FC Midtjylland');
    expect(t.color).toBe('#0B0807');
    expect(t.color).not.toBe('#E4002B');            // den gamle, forkerte
    expect(t.troejer.hjemme.moenster).toBe('striber');
    expect(t.troejer.hjemme.sekundaer).toBe('#E4002B');
  });

  it('FCK er HVID — marineblå er deres anden farve, ikke trøjen', () => {
    const t = hold('F.C. København');
    expect(t.color).toBe('#FFFFFF');
    expect(t.color).not.toBe('#0A2240');
    // Den gamle primærfarve er flyttet til udefarven, ellers stod hvid mod hvid.
    expect(t.awayColor).toBe('#0A2240');
  });

  it('FCN er RØD med gule bøjler — ikke ensfarvet gul', () => {
    const t = hold('FC Nordsjælland');
    expect(t.color).toBe('#B80112');
    expect(t.color).not.toBe('#FFD200');
    expect(t.troejer.hjemme.moenster).toBe('boejler');
    expect(t.troejer.hjemme.sekundaer).toBe('#FDDF16');
  });

  it('Randers er LYSEBLÅ — ikke marineblå', () => {
    const t = hold('Randers FC');
    expect(t.color).toBe('#78C5ED');
    expect(t.color).not.toBe('#003C7E');
    // Skråbåndet kan badgen ikke tegne, så trøjen står med vilje ensfarvet.
    expect(t.troejer).toBeUndefined();
  });

  it('Sønderjyske er LYSEBLÅ med hvide striber — ikke marineblå', () => {
    const t = hold('Sønderjyske Fodbold');
    expect(t.color).toBe('#B3D6E9');
    expect(t.color).not.toBe('#1B3A6B');
    expect(t.troejer.hjemme.moenster).toBe('striber');
    expect(t.awayColor).toBe('#1B3A6B');
  });

  it('Silkeborg er RØD — ikke blå', () => {
    const t = hold('Silkeborg IF');
    expect(t.color).toBe('#CA202C');
    expect(t.color).not.toBe('#003DA5');
    // Den blå er klubbens anden farve og hører hjemme som tredjefarve.
    expect(t.thirdColor).toBe('#003DA5');
  });
});

describe('mønstre, der var rigtige i farven men manglede formen', () => {
  it.each([
    ['AGF', '#1E1E23'],            // hvid med marineblå pinstriber
    ['OB', '#FFFFFF'],             // blå/hvid lodret stribet
    ['AC Horsens', '#292724'],     // gul/sort lodret stribet
  ])('%s er stribet', (navn, sekundaer) => {
    const t = hold(navn);
    expect(t.troejer.hjemme.moenster).toBe('striber');
    expect(t.troejer.hjemme.sekundaer).toBe(sekundaer);
  });

  // Og modsat: de fire ensfarvede må IKKE have fået et mønster på.
  it.each(['Brøndby IF', 'Viborg FF', 'Lyngby Boldklub', 'F.C. København'])(
    '%s står ensfarvet', (navn) => {
      expect(hold(navn).troejer?.hjemme?.moenster).toBeUndefined();
    },
  );
});

describe('opslagsfunktionerne', () => {
  it('giver Elo for hvert hold', () => {
    const map = superligaEloMap();
    expect(Object.keys(map)).toHaveLength(12);
    expect(map['FC Midtjylland']).toBe(1657);
  });

  // Et ukendt navn skal give null, ikke et tilfældigt hold. Fallbacken til
  // 1500 i teamElo er tavs, og det er præcis den fælde, holdlisterne findes for.
  it('giver null for et navn, listen ikke kender', () => {
    expect(superligaTeamInfo('FC Ukendt')).toBeNull();
  });

  it('finder et hold på dets eksakte navn', () => {
    expect(superligaTeamInfo('OB')?.short).toBe('OB');
  });
});
