import { describe, it, expect } from 'vitest';
import { koerTeamsOnly } from './teamsOnly.mjs';

// En fake af det, Firestore giver os. Den TÆLLER skrivninger, for det er hele
// pointen: `teamsVagt` var grundigt unit-testet, og alligevel kunne kaldet af
// den slettes fra scriptet med hele suiten grøn. Her kan det ikke.
const fakeRef = (teams) => {
  const kald = [];
  return {
    id: 'sl-test',
    kald,
    get: async () => ({ exists: teams !== null, data: () => ({ teams }) }),
    set: async (data, opts) => { kald.push({ data, opts }); },
  };
};

const rfc = { name: 'Randers FC', elo: 1472, color: '#78C5ED' };
const andre = [{ name: 'AGF', elo: 1600 }, { name: 'OB', elo: 1500 }];
const koer = (ref, teams, skriv) => koerTeamsOnly({
  gameRef: ref, teams, skriv, serverTimestamp: 'NU',
});

describe('koerTeamsOnly', () => {
  it('SKRIVER IKKE i en tør-kørsel, selv når ændringen er lovlig', () => {
    const ref = fakeRef([rfc, ...andre]);
    return koer(ref, [{ ...rfc, thirdColor: '#FC8033' }, ...andre], false).then((r) => {
      expect(r.grund).toBe('toerkoersel');
      expect(r.skrevet).toBe(false);
      expect(ref.kald).toHaveLength(0);
    });
  });

  it('SKRIVER, når ændringen er lovlig og --skriv er sat', async () => {
    const ref = fakeRef([rfc, ...andre]);
    const nye = [{ ...rfc, thirdColor: '#FC8033' }, ...andre];
    const r = await koer(ref, nye, true);
    expect(r.grund).toBe('skrevet');
    expect(ref.kald).toHaveLength(1);
    // KUN teams og updatedAt. Skrives der mere, er påstanden i drift.md forkert.
    expect(Object.keys(ref.kald[0].data).sort()).toEqual(['teams', 'updatedAt']);
    expect(ref.kald[0].data.teams).toEqual(nye);
    expect(ref.kald[0].opts).toEqual({ merge: true });
  });

  it('KASTER og skriver INTET, når elo ville ændre sig — også med --skriv', async () => {
    // Den ene linje, hele forskellen hænger på. Før lå den i scriptet og kunne
    // slettes med grøn suite.
    const ref = fakeRef([{ ...rfc, elo: 1502 }, ...andre]);
    await expect(koer(ref, [rfc, ...andre], true)).rejects.toThrow(/rører point/);
    expect(ref.kald).toHaveLength(0);
  });

  it('kaster på et hold, der forsvinder — og på et, der kommer til', async () => {
    const væk = fakeRef([rfc, ...andre]);
    await expect(koer(væk, [rfc], true)).rejects.toThrow(/rører point/);
    expect(væk.kald).toHaveLength(0);

    const til = fakeRef([rfc]);
    await expect(koer(til, [rfc, ...andre], true)).rejects.toThrow(/rører point/);
    expect(til.kald).toHaveLength(0);
  });

  it('kaster på en dublet i filen', async () => {
    const ref = fakeRef([rfc, ...andre]);
    await expect(koer(ref, [rfc, ...andre, andre[0]], true)).rejects.toThrow(/rører point/);
    expect(ref.kald).toHaveLength(0);
  });

  it('KASTER OGSÅ i en tør-kørsel, når vagten slår til', async () => {
    // Her stod før et råd om at "køre igen med --skriv" — forkert i præcis den
    // tilstand, hvor kørslen aldrig ville få lov. Operatøren skal rette
    // holdlisten, ikke prøve igen.
    const ref = fakeRef([{ ...rfc, elo: 1502 }, ...andre]);
    let tekst = '';
    await expect(koerTeamsOnly({
      gameRef: ref,
      teams: [rfc, ...andre],
      skriv: false,
      serverTimestamp: 'NU',
      log: (s) => { tekst += `${s}\n`; },
    })).rejects.toThrow(/rører point/);
    expect(tekst).not.toContain('Kør igen med --skriv');
    expect(tekst).toContain('⛔');
  });

  it('skriver ikke, når holdlisten allerede er den rigtige', async () => {
    const ref = fakeRef([rfc, ...andre]);
    const r = await koer(ref, [rfc, ...andre], true);
    expect(r.grund).toBe('uaendret');
    expect(ref.kald).toHaveLength(0);
  });

  it('SKRIVER ved en ren omrokering — den advarer, men spærrer ikke', async () => {
    const ref = fakeRef([rfc, ...andre]);
    let tekst = '';
    const r = await koerTeamsOnly({
      gameRef: ref,
      teams: [andre[0], rfc, andre[1]],
      skriv: true,
      serverTimestamp: 'NU',
      log: (s) => { tekst += `${s}\n`; },
    });
    expect(r.grund).toBe('skrevet');
    expect(ref.kald).toHaveLength(1);
    expect(tekst).toContain('rækkefølgen er en anden');
  });

  it('kaster, hvis spillet slet ikke findes', async () => {
    await expect(koer(fakeRef(null), [rfc], true)).rejects.toThrow(/findes ikke/);
  });

  it('siger til, når spillet ingen holdliste har i forvejen', async () => {
    const ref = fakeRef([]);
    let tekst = '';
    // Alle hold er "tilfoejede", så vagten afviser — et tomt spil skal seedes
    // fuldt, ikke lappes her. Beskeden skal sige begge dele.
    await expect(koerTeamsOnly({
      gameRef: ref, teams: [rfc], skriv: true, serverTimestamp: 'NU', log: (s) => { tekst += `${s}\n`; },
    })).rejects.toThrow(/rører point/);
    expect(tekst).toContain('seedes fuldt');
    expect(ref.kald).toHaveLength(0);
  });

  it('viser HVER feltændring, ikke kun de første', async () => {
    const gammel = { ...rfc, color: '#000000', awayColor: '#111111' };
    const ref = fakeRef([gammel, ...andre]);
    let tekst = '';
    await koerTeamsOnly({
      gameRef: ref,
      teams: [{ ...rfc, thirdColor: '#FC8033' }, ...andre],
      skriv: false,
      serverTimestamp: 'NU',
      log: (s) => { tekst += `${s}\n`; },
    });
    for (const felt of ['color', 'awayColor', 'thirdColor']) expect(tekst).toContain(felt);
  });
});
