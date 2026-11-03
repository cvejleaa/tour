import { describe, it, expect } from 'vitest';
import { koerTeamsOnly, landeflagLinje } from './teamsOnly.mjs';
import { HAANDBOLD_VM2027_HOLD } from '../../src/data/haandboldVm2027Hold.js';

// En fake af det, Firestore giver os. Den TÆLLER skrivninger, for det er hele
// pointen: `teamsVagt` var grundigt unit-testet, og alligevel kunne kaldet af
// den slettes fra scriptet med hele suiten grøn. Her kan det ikke.
const fakeRef = (teams, teamStyles) => {
  const kald = [];
  return {
    id: 'sl-test',
    kald,
    get: async () => ({ exists: teams !== null, data: () => ({ teams, teamStyles }) }),
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

describe('gemte overrides i tør-kørslen', () => {
  // Det, ejeren spurgte om: "er der andre, jeg skal nulstille?" Svaret skal
  // stå i tør-kørslen, ikke afhænge af at nogen scanner 128 felter i fladen
  // efter en lille pil.
  const teams = [
    { name: 'Randers FC', color: '#78C5ED', awayColor: '#33384F', thirdColor: '#FC8033' },
    { name: 'AGF', color: '#0B4EA2', awayColor: '#FFFFFF', thirdColor: '#111111' },
  ];
  const koerMedLog = async (ref, nye) => {
    let tekst = '';
    await koerTeamsOnly({
      gameRef: ref, teams: nye, skriv: false, serverTimestamp: 'NU', log: (s) => { tekst += `${s}\n`; },
    });
    return tekst;
  };

  it('NAVNGIVER hvert felt, der er rettet i hånden — og hvad listen siger', async () => {
    const ref = fakeRef(teams, { 'Randers FC': { thirdColor: '#003C7E' } });
    const tekst = await koerMedLog(ref, teams);
    expect(tekst).toContain('1 felter er rettet i hånden');
    expect(tekst).toContain('Randers FC');
    expect(tekst).toContain('tredje');
    expect(tekst).toContain('#003C7E');
    expect(tekst).toContain('#FC8033');
    // Og den skal SIGE, hvad konsekvensen er — ellers er tallet bare et tal.
    expect(tekst).toContain('VINDER over holdlisten');
    expect(tekst).toContain('Hold-farver');
  });

  it('siger positivt fra, når INTET er rettet i hånden', async () => {
    // "Ingen overrides" må ikke se ud som manglende data. En tom tilstand,
    // der ikke siger noget, læses som at rapporten ikke virkede.
    const tekst = await koerMedLog(fakeRef(teams, {}), teams);
    expect(tekst).toContain('ingen farver er rettet i hånden');
    expect(tekst).not.toContain('rettet i hånden (games/');
  });

  it('rapporterer overrides, SELV når holdlisten er uændret', async () => {
    // Den vigtigste gren. Produktionen er i sync, så kørslen er en no-op —
    // og præcis dér blev spørgsmålet stillet. Rapporten må ikke kun komme,
    // når der tilfældigvis også er en listeændring.
    const ref = fakeRef(teams, { AGF: { color: '#000000' } });
    const tekst = await koerMedLog(ref, teams);
    expect(tekst).toContain('Holdlisten er allerede den, filen beskriver');
    expect(tekst).toContain('AGF');
    expect(tekst).toContain('#000000');
  });

  it('nævner overrides på hold, der ikke er i spillet, og hvad der sker med dem', async () => {
    const ref = fakeRef(teams, { 'Vejle Boldklub': { color: '#E4002B' } });
    const tekst = await koerMedLog(ref, teams);
    expect(tekst).toContain('Vejle Boldklub');
    expect(tekst).toContain('ryddes');
  });

  it('melder ikke en override, der er lig holdlisten', async () => {
    const ref = fakeRef(teams, { 'Randers FC': { thirdColor: '#fc8033' } });
    const tekst = await koerMedLog(ref, teams);
    expect(tekst).toContain('ingen farver er rettet i hånden');
  });

  it('rapporterer også, når vagten spærrer — man skal ikke rette i blinde', async () => {
    const gammel = [{ ...teams[0], elo: 1502 }, teams[1]];
    const ref = fakeRef(gammel, { 'Randers FC': { thirdColor: '#003C7E' } });
    let tekst = '';
    await expect(koerTeamsOnly({
      gameRef: ref,
      teams: [{ ...teams[0], elo: 1472 }, teams[1]],
      skriv: false,
      serverTimestamp: 'NU',
      log: (s) => { tekst += `${s}\n`; },
    })).rejects.toThrow(/rører point/);
    expect(tekst).toContain('rettet i hånden');
  });
});

// ---------------------------------------------------------------------------
// LANDEFLAG-LINJEN (QC på flagplanen, fund 5). Holdfilen lovede farver «i D6»,
// og de 32 grå trøjer så ingen. Tør-kørslen siger nu højt, om flaget bliver
// vist — fra den SAMME funktion, klienten gater på (landeflagKoder.js).
// ---------------------------------------------------------------------------
describe('landeflagLinje', () => {
  const uden = (t) => { const { iso2: _i, ...r } = t; return r; };

  it('32 af 32: flaget vises — og hvad spillet har i dag', () => {
    expect(landeflagLinje(HAANDBOLD_VM2027_HOLD, HAANDBOLD_VM2027_HOLD.map(uden)))
      .toBe('32 af 32 hold — flaget vises (i dag 0 af 32)');
  });

  // ALT ELLER INTET skal stå i linjen: «31 af 32» læses ellers som «næsten».
  it('31 af 32: siger højt, at INGEN flag vises', () => {
    const mangler = HAANDBOLD_VM2027_HOLD.map((t, i) => (i === 0 ? uden(t) : t));
    expect(landeflagLinje(mangler, HAANDBOLD_VM2027_HOLD))
      .toBe('31 af 32 hold — INGEN flag vises (alt eller intet) (i dag 32 af 32)');
  });

  it('en klubliga: ingen flag — trøjer', () => {
    expect(landeflagLinje([rfc, ...andre], [rfc, ...andre])).toBe('0 af 3 hold — ingen flag — trøjer (i dag 0 af 3)');
    expect(landeflagLinje([rfc], undefined)).toBe('0 af 1 hold — ingen flag — trøjer (i dag 0 af 0)');
  });

  it('står i tør-kørslens udskrift', async () => {
    let tekst = '';
    await koerTeamsOnly({
      gameRef: fakeRef([rfc, ...andre]), teams: [{ ...rfc, thirdColor: '#FC8033' }, ...andre],
      skriv: false, serverTimestamp: 'NU', log: (x) => { tekst += `${x}\n`; },
    });
    expect(tekst).toContain('  landeflag     : 0 af 3 hold — ingen flag — trøjer (i dag 0 af 3)\n');
  });
});

// ---------------------------------------------------------------------------
// DEN FORVENTEDE TØR-KØRSEL FOR hvm2027 (F3), offline. Produktionen er
// antaget = holdfilen på 3bac21e (D6 seedede de rå objekter, fuldtSeed.mjs),
// altså holdfilen UDEN iso2 og farver. PÅSTAND, som Release Manager
// efterprøver læs-only før skrivningen: viser den rigtige tør-kørsel andet
// end det her, er filen eller produktionen drevet, og der skrives ikke.
// ---------------------------------------------------------------------------
describe('Ret holdlisten for hvm2027 — den forventede tør-kørsel', () => {
  const NYE = ['iso2', 'color', 'awayColor'];
  const prod = HAANDBOLD_VM2027_HOLD.map((t) => Object.fromEntries(Object.entries(t).filter(([k]) => !NYE.includes(k))));

  it('96 feltændringer — iso2, color og awayColor på hver af de 32, alle fra —', async () => {
    let tekst = '';
    const ref = fakeRef(prod);
    const r = await koerTeamsOnly({
      gameRef: ref, teams: HAANDBOLD_VM2027_HOLD, skriv: false, serverTimestamp: 'NU',
      log: (x) => { tekst += `${x}\n`; },
    });
    expect(r.grund).toBe('toerkoersel');
    expect(r.vagt.ok).toBe(true);
    expect(ref.kald).toHaveLength(0);
    expect(r.plan.aendringer).toHaveLength(96);
    expect(new Set(r.plan.aendringer.map((a) => a.felt))).toEqual(new Set(NYE));
    expect(r.plan.aendringer.every((a) => a.fra === undefined)).toBe(true);
    expect(r.plan.uaendrede).toBe(0);
    expect(r.plan.tilfoejede).toEqual([]);
    expect(r.plan.forsvundne).toEqual([]);
    expect(r.plan.omrokeret).toBe(false);
    expect(tekst).toContain('  96 feltændringer:\n');
    expect(tekst).toContain('    Danmark  iso2: — → "dk"\n');
    expect(tekst).toContain('    Danmark  color: — → "#C8102E"\n');
    expect(tekst).toContain('  landeflag     : 32 af 32 hold — flaget vises (i dag 0 af 32)\n');
  });

  it('en gentaget tør-kørsel efter skrivningen siger «intet at gøre»', async () => {
    const r = await koerTeamsOnly({
      gameRef: fakeRef(HAANDBOLD_VM2027_HOLD), teams: HAANDBOLD_VM2027_HOLD, skriv: false, serverTimestamp: 'NU',
    });
    expect(r.grund).toBe('uaendret');
  });
});
