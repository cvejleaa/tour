import { describe, it, expect } from 'vitest';
import {
  docId, kickoffMs, tjekDubletter, parseArgs,
  parseRunder, iInterval, kickoffPlan, seedPlan, ukendteHold,
} from './seedFootball';
import { matchId, buildMatch } from './superligaSeed';

// ---------------------------------------------------------------------------
// ARGUMENTERNE. De to måder at stave galt på fejler i hver sin retning, og det
// er kun den ene, der er farlig:
//   --skriv → --skrive             tørkører. Man opdager det med det samme.
//   --kickoffs-only → --kickoff-only   flaget forsvinder — og fordi --teams står
//     med i den dokumenterede kommando, passerer argument-tjekket, så der køres
//     et FULDT SEED med skrivning, hvor der skulle have været rettet en tid.
// ---------------------------------------------------------------------------
describe('parseArgs', () => {
  it('læser de kendte argumenter og flag', () => {
    const a = parseArgs(['--game', 'pl2627-efteraar', '--runder', '1-18', '--kickoffs-only', '--skriv']);
    expect(a.game).toBe('pl2627-efteraar');
    expect(a.runder).toBe('1-18');
    expect(a.flags.has('kickoffs-only')).toBe(true);
    expect(a.flags.has('skriv')).toBe(true);
  });

  it('siger fra ved en typo i --kickoffs-only — den må ALDRIG blive til et fuldt seed', () => {
    expect(() => parseArgs(['--game', 'x', '--kickoff-only', '--skriv'])).toThrow(/ukendt argument --kickoff-only/);
  });

  it('siger fra ved --rounds, som ellers ville seede alle 38 runder', () => {
    expect(() => parseArgs(['--game', 'x', '--rounds', '1-18'])).toThrow(/ukendt argument --rounds/);
  });

  it('siger fra ved --runder uden værdi — ikke stiltiende "alle runder"', () => {
    expect(() => parseArgs(['--game', 'x', '--runder'])).toThrow(/--runder mangler en værdi/);
  });

  it('siger fra, når et flag får en værdi med', () => {
    expect(() => parseArgs(['--skriv', 'ja'])).toThrow(/tager ikke en værdi/);
  });

  it('siger fra ved løsrevne ord', () => {
    expect(() => parseArgs(['seed'])).toThrow(/forstod ikke/);
  });
});

// ---------------------------------------------------------------------------
// KICKOFF SOM TAL. Kickoff ER tip-deadlinen, og filen gensynkroniseres løbende
// fra API'et — et formatskift i kilden rammer præcis her.
// ---------------------------------------------------------------------------
describe('kickoffMs', () => {
  it('læser en ISO-tid med zone', () => {
    expect(kickoffMs('2026-08-22T14:00:00Z')).toBe(Date.UTC(2026, 7, 22, 14));
    expect(kickoffMs('2026-08-22T16:00:00+02:00')).toBe(Date.UTC(2026, 7, 22, 14));
  });

  it('ingen tid er ingen tid', () => {
    expect(kickoffMs(null)).toBeNull();
    expect(kickoffMs('')).toBeNull();
  });

  // Uden zone læses strengen i maskinens egen zone: 12:00Z på en dansk laptop,
  // 14:00Z i CI. Så ville deadlinen afhænge af, hvor scriptet blev kørt.
  it('afviser en tid uden tidszone', () => {
    expect(() => kickoffMs('2026-08-22T14:00:00')).toThrow(/tidszone/);
  });

  // NaN er hverken lig null eller sig selv: kampen ville blive skrevet med en
  // ugyldig tid OG rapporteret som "ændret" ved hver eneste kørsel herefter.
  it('afviser noget, der ikke kan læses som en dato', () => {
    // Har en zone, så den slipper forbi tjekket ovenfor — og er stadig vrøvl.
    expect(() => kickoffMs('24-08-2026 19:00Z')).toThrow(/kunne ikke læses/);
    expect(() => kickoffMs('senere+02:00')).toThrow(/kunne ikke læses/);
  });
});

// ---------------------------------------------------------------------------
// Dubletter: to rækker med samme dokument-id giver to skrivninger på det samme
// dokument — sidste vinder, uden et ord.
// ---------------------------------------------------------------------------
describe('tjekDubletter', () => {
  it('siger fra ved to kampe med samme id', () => {
    expect(() => tjekDubletter([{ id: 'a' }, { id: 'b' }, { id: 'a' }])).toThrow(/dubletter: a/);
  });

  it('fanger også dubletter, der først opstår efter udledning af id', () => {
    const fx = [{ round: 1, home: 'OB', away: 'AGF' }, { round: 1, home: 'OB', away: 'AGF' }];
    expect(() => tjekDubletter(fx)).toThrow(/dubletter/);
  });

  it('er tilfreds med et rigtigt kampprogram', () => {
    expect(() => tjekDubletter([{ id: 'a' }, { id: 'b' }])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Premier League-programmet har id'er med fra pulselive. Superligaens
// `superliga-fixtures.json` har INGEN — der laver `buildMatch` id'et selv af
// runde+hold. Slog vi op på `fx.id` alene, ville hvert Superliga-opslag ramme
// `undefined`, og beskyttelserne nedenfor ville beskytte nul kampe i tavshed.
// ---------------------------------------------------------------------------
describe('docId', () => {
  it('bruger kampens eget id, når den har et (Premier League)', () => {
    expect(docId({ id: 'r1-124821', round: 1, home: 'Arsenal', away: 'Chelsea' })).toBe('r1-124821');
  });

  it('udleder id af runde+hold, når der ikke er et (Superligaen)', () => {
    const fx = { round: 1, home: 'Viborg FF', away: 'OB' };
    expect(docId(fx)).toBe(matchId(fx)); // SAMME regel som buildMatch skriver med
  });

  it('siger fra, når kampen hverken har id eller runde+hold', () => {
    expect(() => docId({ home: 'Arsenal', away: 'Chelsea' })).toThrow(/genfindes/);
    expect(() => docId({ round: 1, home: 'Arsenal' })).toThrow(/genfindes/);
  });

  // docId og buildMatch koder den SAMME regel to steder. Denne ene linje er
  // det, der binder dem sammen — uden den kan de drive fra hinanden i tavshed.
  it('er altid enig med det id, buildMatch skriver dokumentet under', () => {
    const medId = { id: 'r1-124821', round: 1, home: 'Arsenal', away: 'Chelsea' };
    const udenId = { round: 1, home: 'Viborg FF', away: 'OB' };
    expect(docId(medId)).toBe(buildMatch(medId, []).id);
    expect(docId(udenId)).toBe(buildMatch(udenId, []).id);
  });

  // Firestores dokument-id'er er strenge. En kilde med tal-id'er ville ellers
  // give et opslag, der aldrig rammer — og en ubeskyttet kamp i tavshed.
  it('gør et tal-id til en streng, så opslaget rammer', () => {
    expect(docId({ id: 2645195, round: 1, home: 'A', away: 'B' })).toBe('2645195');
  });
});

describe('parseRunder', () => {
  it('læser et interval', () => {
    expect(parseRunder('1-18')).toEqual({ fra: 1, til: 18 });
    expect(parseRunder(' 19 - 38 ')).toEqual({ fra: 19, til: 38 });
  });
  it('uden interval betyder alle runder', () => {
    expect(parseRunder(null)).toBeNull();
    expect(parseRunder('')).toBeNull();
  });
  // Et bagvendt interval ville give nul kampe og se ud som en tom fil.
  it('afviser vrøvl og bagvendte intervaller', () => {
    expect(() => parseRunder('atten')).toThrow();
    expect(() => parseRunder('18')).toThrow();
    expect(() => parseRunder('38-19')).toThrow();
  });
});

describe('iInterval', () => {
  const fx = [{ round: 1 }, { round: 18 }, { round: 19 }, { round: 38 }];
  it('deler ved runde, ikke ved dato — det er sådan de to spil er skåret', () => {
    expect(iInterval(fx, { fra: 1, til: 18 })).toHaveLength(2);
    expect(iInterval(fx, { fra: 19, til: 38 })).toHaveLength(2);
  });
  it('uden interval kommer alt med', () => {
    expect(iInterval(fx, null)).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// KUN KICKOFF. Det er den rutine, der skal køre hele sæsonen, fordi Premier
// League udgiver 33 runder i samme standard-slot og flytter dem hen ad vejen.
// Kickoff ER tip-deadlinen, så en forkert tid lukker kuponen på det forkerte
// tidspunkt — og `pendingMatches` i synken leder kun efter kampe i et vindue
// omkring tidspunktet, så facit ville aldrig lande.
// ---------------------------------------------------------------------------
describe('kickoffPlan', () => {
  const T = (iso) => new Date(iso).getTime();

  it('ændrer en tid, der har flyttet sig', () => {
    const fx = [{ id: 'r1-1', kickoff: '2026-08-22T14:00:00Z' }];
    const nu = new Map([['r1-1', { kickoffMs: T('2026-08-22T19:00:00Z') }]]);
    const p = kickoffPlan(fx, nu);
    expect(p.aendringer).toEqual([
      { id: 'r1-1', fraMs: T('2026-08-22T19:00:00Z'), tilMs: T('2026-08-22T14:00:00Z') },
    ]);
  });

  it('rører ikke en uændret tid — en skrivning uden ændring er støj', () => {
    const fx = [{ id: 'r1-1', kickoff: '2026-08-22T19:00:00Z' }];
    const nu = new Map([['r1-1', { kickoffMs: T('2026-08-22T19:00:00Z') }]]);
    expect(kickoffPlan(fx, nu).aendringer).toEqual([]);
  });

  // Tidspunktet på en spillet kamp er HISTORIE. Flytter vi det, ville
  // kampkortet pludselig påstå, at kampen bliver spillet i morgen.
  it('rører ikke en kamp, der allerede har et resultat', () => {
    const fx = [{ id: 'r1-1', kickoff: '2026-09-01T19:00:00Z' }];
    const nu = new Map([['r1-1', { kickoffMs: T('2026-08-22T19:00:00Z'), result: '1' }]]);
    const p = kickoffPlan(fx, nu);
    expect(p.aendringer).toEqual([]);
    expect(p.sprunget).toBe(1);
  });

  // superligaSync.js behandler fire steder result === '' som "intet facit
  // endnu". Rammer vi ikke samme konvention, ville en kamp med ryddet facit
  // aldrig kunne få rettet sit tidspunkt igen.
  it('behandler ryddet facit ("") som ikke spillet — samme regel som synken', () => {
    const fx = [{ id: 'r1-1', kickoff: '2026-09-01T19:00:00Z' }];
    const nu = new Map([['r1-1', { kickoffMs: T('2026-08-22T19:00:00Z'), result: '' }]]);
    expect(kickoffPlan(fx, nu).aendringer).toHaveLength(1);
  });

  it('rører ikke en kamp, der slet ikke er seedet endnu', () => {
    const p = kickoffPlan([{ id: 'findes-ikke', kickoff: '2026-08-22T19:00:00Z' }], new Map());
    expect(p.aendringer).toEqual([]);
    expect(p.sprunget).toBe(1);
  });

  // En TBD-kamp, der endelig får et tidspunkt, er den ene retning vi TILLADER.
  // Den modsatte vej — at fjerne en tid, der står — afvises; se testen nedenfor.
  it('giver en kamp uden tid dens første tidspunkt', () => {
    const fx = [{ id: 'b', kickoff: '2026-12-26T15:00:00Z' }];
    const nu = new Map([['b', { kickoffMs: null }]]);
    const p = kickoffPlan(fx, nu);
    expect(p.aendringer).toEqual([
      { id: 'b', fraMs: null, tilMs: T('2026-12-26T15:00:00Z') },
    ]);
  });

  it('lader en kamp uden tid i BEGGE ender være i fred', () => {
    const p = kickoffPlan([{ id: 'a', kickoff: null }], new Map([['a', { kickoffMs: null }]]));
    expect(p.aendringer).toEqual([]);
  });

  // Superligaens program har ingen id'er. Uden udledning ville opslaget ramme
  // `undefined`, kampen se ud som "ikke seedet endnu" — og tiden aldrig rettes.
  it('finder også en Superliga-kamp, der ikke har et id i filen', () => {
    const fx = [{ round: 1, home: 'Viborg FF', away: 'OB', kickoff: '2026-07-24T17:00:00Z' }];
    const nu = new Map([[matchId(fx[0]), { kickoffMs: T('2026-07-24T15:00:00Z') }]]);
    const p = kickoffPlan(fx, nu);
    expect(p.aendringer).toHaveLength(1);
    expect(p.aendringer[0].id).toBe(matchId(fx[0]));
    expect(p.sprunget).toBe(0);
  });

  // Valideringen skal sidde i PLANEN, ikke kun i hjælpefunktionen — ellers kan
  // kaldet skiftes ud med new Date() igen uden en eneste rød test.
  it('afviser en ulæselig eller zone-løs tid i selve planen', () => {
    const nu = new Map([['r1-1', { kickoffMs: 0 }]]);
    expect(() => kickoffPlan([{ id: 'r1-1', kickoff: '2026-08-22T14:00:00' }], nu)).toThrow(/tidszone/);
    expect(() => kickoffPlan([{ id: 'r1-1', kickoff: '24-08-2026 19:00Z' }], nu)).toThrow(/kunne ikke læses/);
  });

  // At rydde en tid, der står, er ikke en tidsrettelse: tippet afvises af
  // reglerne, knapperne står alligevel åbne, og påmindelsen udebliver.
  it('nægter at fjerne en tid, der allerede står', () => {
    const nu = new Map([['r1-1', { kickoffMs: T('2026-08-22T19:00:00Z') }]]);
    expect(() => kickoffPlan([{ id: 'r1-1', kickoff: null }], nu)).toThrow(/Ryd den bevidst/);
  });

  it('tæller "ikke seedet" og "allerede spillet" hver for sig', () => {
    const fx = [{ id: 'mangler' }, { id: 'spillet', kickoff: '2026-08-22T19:00:00Z' }];
    const nu = new Map([['spillet', { kickoffMs: 0, result: '1' }]]);
    const p = kickoffPlan(fx, nu);
    expect(p.mangler).toEqual(['mangler']);
    expect(p.spillet).toBe(1);
    expect(p.sprunget).toBe(2);
  });

  it('kræver noget at genfinde kampen på', () => {
    expect(() => kickoffPlan([{ kickoff: '2026-08-22T19:00:00Z' }], new Map())).toThrow(/genfindes/);
  });
});

// ---------------------------------------------------------------------------
// FULDT SEED. Fælden i det gamle script: det skrev odds ubetinget med merge.
// En gen-kørsel i oktober ville have overskrevet frosne odds på kampe, folk
// havde tippet og fået point for.
// ---------------------------------------------------------------------------
describe('seedPlan', () => {
  it('springer kampe over, der allerede har frosne odds', () => {
    const fx = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const nu = new Map([
      ['a', { odds: { 1: 2, X: 3, 2: 4 } }],
      ['b', {}],                                  // findes, men uden odds
    ]);
    const p = seedPlan(fx, nu);
    expect(p.springOver).toEqual(['a']);
    expect(p.skriv.map((f) => f.id)).toEqual(['b', 'c']);
  });

  // Superligaen igen: uden udledt id ville ALLE 132 kampe se ud som nye, og en
  // gen-kørsel ville overskrive frosne odds under folk, der havde tippet.
  it('beskytter også frosne odds på en kamp uden id i filen', () => {
    const fx = [
      { round: 1, home: 'Viborg FF', away: 'OB' },
      { round: 1, home: 'Brøndby IF', away: 'FC København' },
    ];
    const nu = new Map([[matchId(fx[0]), { odds: { 1: 2, X: 3, 2: 4 } }]]);
    const p = seedPlan(fx, nu);
    expect(p.springOver).toEqual([matchId(fx[0])]);
    expect(p.skriv).toEqual([fx[1]]);
  });

  it('skriver alt på et tomt spil', () => {
    const p = seedPlan([{ id: 'a' }, { id: 'b' }], new Map());
    expect(p.springOver).toEqual([]);
    expect(p.skriv).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Den tavse fælde: `teamElo` giver 1500 for et navn, den ikke kender — uden
// fejl, uden log. Hele klubben ville få odds som et midterhold.
// ---------------------------------------------------------------------------
describe('ukendteHold', () => {
  const teams = [{ name: 'Arsenal' }, { name: 'Brighton and Hove Albion' }];

  it('finder navne, der ikke står i holdlisten', () => {
    const fx = [
      { home: 'Arsenal', away: 'Brighton' },              // clubelo-stavemåden
      { home: 'Brighton and Hove Albion', away: 'Arsenal' },
    ];
    expect(ukendteHold(fx, teams)).toEqual(['Brighton']);
  });

  it('er tom, når alt matcher', () => {
    expect(ukendteHold([{ home: 'Arsenal', away: 'Brighton and Hove Albion' }], teams)).toEqual([]);
  });

  it('nævner hvert ukendt hold én gang', () => {
    const fx = [{ home: 'Vejle', away: 'Vejle' }, { home: 'Vejle', away: 'Arsenal' }];
    expect(ukendteHold(fx, teams)).toEqual(['Vejle']);
  });
});
