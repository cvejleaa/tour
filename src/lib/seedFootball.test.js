import { describe, it, expect } from 'vitest';
import {
  docId, parseRunder, iInterval, kickoffPlan, seedPlan, ukendteHold,
} from './seedFootball';
import { matchId } from './superligaSeed';

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

  it('rører ikke en kamp, der slet ikke er seedet endnu', () => {
    const p = kickoffPlan([{ id: 'findes-ikke', kickoff: '2026-08-22T19:00:00Z' }], new Map());
    expect(p.aendringer).toEqual([]);
    expect(p.sprunget).toBe(1);
  });

  // En udsat kamp kan miste sin dato helt, og en TBD-kamp kan få én.
  it('håndterer begge veje: tid fjernet og tid tilføjet', () => {
    const fx = [{ id: 'a', kickoff: null }, { id: 'b', kickoff: '2026-12-26T15:00:00Z' }];
    const nu = new Map([
      ['a', { kickoffMs: T('2026-12-26T15:00:00Z') }],
      ['b', { kickoffMs: null }],
    ]);
    const p = kickoffPlan(fx, nu);
    expect(p.aendringer.find((x) => x.id === 'a').tilMs).toBeNull();
    expect(p.aendringer.find((x) => x.id === 'b').fraMs).toBeNull();
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
