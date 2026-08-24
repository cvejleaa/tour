import { describe, it, expect } from 'vitest';
import {
  docId, kickoffMs, tjekDubletter, parseArgs,
  parseRunder, iInterval, kickoffPlan, seedPlan, ukendteHold, teamsPlan, teamsVagt,
  overrideAfvig,
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

// ---------------------------------------------------------------------------
// HOLDLISTEN. Det, der kan gå galt, er ikke skrivningen men hvad den TAGER MED
// og hvad den taber. `teams` er et array: en skrivning erstatter det helt.
// ---------------------------------------------------------------------------

describe('teamsPlan', () => {
  const rfc = {
    name: 'Randers FC', short: 'RFC', elo: 1472, color: '#78C5ED',
    awayColor: '#33384F', thirdColor: '#FC8033',
    troejer: { hjemme: { sekundaer: '#30374F', moenster: 'skraabaand' } },
    venue: 'Cepheus Park Randers',
  };

  it('melder INGEN ændring, når filen og produktionen er ens', () => {
    // Kørslen skal kunne gentages uden at støje. Meldte den en ændring hver
    // gang, ville en ægte ændring drukne i den.
    const p = teamsPlan([rfc], [{ ...rfc }]);
    expect(p.aendringer).toEqual([]);
    expect(p.uaendrede).toBe(1);
    expect(p.tilfoejede).toEqual([]);
    expect(p.forsvundne).toEqual([]);
  });

  it('finder en trøjefarve, der MANGLER i produktionen', () => {
    // Præcis den fejl, der blev fundet: Randers stod i marine mod FCM, fordi
    // `thirdColor` ikke fandtes i prod, og `badgeFor` faldt tilbage på
    // udefarven. Så sammenligner `matchBadges` en værdi med sig selv.
    const gammel = { ...rfc };
    delete gammel.thirdColor;
    const p = teamsPlan([rfc], [gammel]);
    expect(p.aendringer).toEqual([
      { name: 'Randers FC', felt: 'thirdColor', fra: undefined, til: '#FC8033' },
    ]);
  });

  it('ser en ændring INDE I `troejer` — ikke kun på det yderste felt', () => {
    // En flad sammenligning ville melde "uændret" om et hold, der var skiftet
    // fra striber til skråbånd: begge er et objekt på samme nøgle.
    const gammel = { ...rfc, troejer: { hjemme: { sekundaer: '#30374F', moenster: 'striber' } } };
    const p = teamsPlan([rfc], [gammel]);
    expect(p.aendringer).toHaveLength(1);
    expect(p.aendringer[0].felt).toBe('troejer');
    expect(p.aendringer[0].til).toEqual(rfc.troejer);
  });

  it('ser et helt NYT nested felt', () => {
    const gammel = { ...rfc };
    delete gammel.troejer;
    const p = teamsPlan([rfc], [gammel]);
    expect(p.aendringer.map((a) => a.felt)).toEqual(['troejer']);
  });

  it('regner `undefined` og et fraværende felt som det samme', () => {
    // Firestore gemmer ikke et felt uden værdi, så prod kommer tilbage uden
    // nøglen, mens filen kan have skrevet `troejer: undefined`. Uden reglen
    // ville HVER kørsel melde en ændring, der ikke findes.
    const p = teamsPlan([{ name: 'X', color: '#111', troejer: undefined }], [{ name: 'X', color: '#111' }]);
    expect(p.aendringer).toEqual([]);
    expect(p.uaendrede).toBe(1);
  });

  it('NÆVNER elo ved navn — feltet er Start-kolonnen, ikke bare et seed-tal', () => {
    // `eloHistory.eloRows` bygger `start` af `t.elo`. En stiltiende ændring
    // her ville omskrive sæsonens udgangspunkt bagud i tid.
    const p = teamsPlan([{ ...rfc, elo: 1500 }], [rfc]);
    expect(p.aendringer).toEqual([
      { name: 'Randers FC', felt: 'elo', fra: 1472, til: 1500 },
    ]);
  });

  it('tæller et hold, der forsvinder, FOR SIG — ikke som en ændring', () => {
    // `teams` er et array, og en skrivning erstatter det helt, også med merge.
    // Et hold i prod, der ikke står i filen, forsvinder sporløst, og hver kamp
    // med det hold mister farve, kortkode og stadion. Det må ikke kunne læses
    // som "én ændring" i en liste med tredive andre.
    const p = teamsPlan([rfc], [rfc, { name: 'Vejle Boldklub', color: '#E4002B' }]);
    expect(p.forsvundne).toEqual(['Vejle Boldklub']);
    expect(p.aendringer).toEqual([]);
    expect(p.uaendrede).toBe(1);
  });

  it('tæller et NYT hold for sig og lister ikke hvert af dets felter', () => {
    const p = teamsPlan([rfc, { name: 'Vejle Boldklub', color: '#E4002B' }], [rfc]);
    expect(p.tilfoejede).toEqual(['Vejle Boldklub']);
    expect(p.aendringer).toEqual([]);
  });

  it('sorterer de forsvundne, så to kørsler kan sammenlignes', () => {
    const p = teamsPlan([], [{ name: 'Å' }, { name: 'A' }, { name: 'M' }]);
    expect(p.forsvundne).toEqual(['A', 'M', 'Å']);
  });

  it('behandler en TOM produktionsliste som "alt er nyt" — ikke som alt ændret', () => {
    // Et spil, der aldrig er seedet, skal ikke give en ændringsliste på
    // hundrede linjer, man alligevel ikke kan læse igennem.
    const p = teamsPlan([rfc], []);
    expect(p.tilfoejede).toEqual(['Randers FC']);
    expect(p.aendringer).toEqual([]);
    expect(p.forsvundne).toEqual([]);
  });

  it('klarer manglende input uden at kaste', () => {
    expect(() => teamsPlan()).not.toThrow();
    expect(teamsPlan(null, null)).toEqual({
      aendringer: [],
      tilfoejede: [],
      forsvundne: [],
      uaendrede: 0,
      omrokeret: false,
      dubletter: [],
    });
  });

  it('melder ALLE ændrede felter på det samme hold', () => {
    // Ét fund er ikke svaret; listen er. Stopper sammenligningen ved det
    // første afvig, ville tør-kørslen vise én farve og skrive tre.
    const gammel = { ...rfc, color: '#000000', awayColor: '#111111', venue: 'Andet' };
    const p = teamsPlan([rfc], [gammel]);
    expect(p.aendringer.map((a) => a.felt).sort()).toEqual(['awayColor', 'color', 'venue']);
  });
});

describe('teamsPlan — rækkefølgen', () => {
  const a = { name: 'A', color: '#1' };
  const b = { name: 'B', color: '#2' };
  const c = { name: 'C', color: '#3' };

  it('opdager en OMROKERING, som ingen felt-diff kan se', () => {
    // PuljeTip tegner pulje-gitteret med teams.map i array-orden, så en
    // omrokering flytter holdknapperne for alle — uden at ét eneste felt har
    // ændret sig. En diff, der matcher på navn, er blind for det.
    const p = teamsPlan([b, a, c], [a, b, c]);
    expect(p.omrokeret).toBe(true);
    expect(p.aendringer).toEqual([]);
    expect(p.uaendrede).toBe(3);
  });

  it('melder IKKE omrokering, når rækkefølgen er den samme', () => {
    expect(teamsPlan([a, b, c], [a, b, c]).omrokeret).toBe(false);
  });

  it('melder ikke omrokering, når forskellen er et hold, der kom til', () => {
    // Så er rækkefølgen trivielt en anden, og `tilfoejede` fortæller det
    // allerede. To tal om det samme ville skjule, hvad der faktisk skete.
    expect(teamsPlan([a, b, c], [a, b]).omrokeret).toBe(false);
    expect(teamsPlan([a, b], [a, b, c]).omrokeret).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// VAGTEN. Anledningen er en trøjefarve, men to felter på `teams` bærer point.
// ---------------------------------------------------------------------------

describe('teamsVagt', () => {
  const rfc = { name: 'Randers FC', elo: 1472, color: '#78C5ED' };

  it('slipper en ren farveændring igennem', () => {
    const plan = teamsPlan([{ ...rfc, thirdColor: '#FC8033' }], [rfc]);
    expect(teamsVagt(plan)).toEqual({ ok: true, grunde: [] });
  });

  it('AFVISER en ændret elo — og siger hvorfor med begge tal', () => {
    // Feltet er seed for recomputeSeasonElo (gameScoring.js:102), ikke bare en
    // kolonneoverskrift. En udskrift, man kan overse, er ikke en vagt: prisen
    // ville være point, der flytter sig uger senere.
    const v = teamsVagt(teamsPlan([{ ...rfc, elo: 1500 }], [rfc]));
    expect(v.ok).toBe(false);
    expect(v.grunde).toHaveLength(1);
    expect(v.grunde[0]).toContain('1472');
    expect(v.grunde[0]).toContain('1500');
    expect(v.grunde[0]).toContain('Randers FC');
    // Og begrundelsen skal pege på den LEVENDE Elo, ikke på Start-kolonnen.
    expect(v.grunde[0]).toMatch(/levende Elo/);
  });

  it('AFVISER et hold, der forsvinder', () => {
    const v = teamsVagt(teamsPlan([rfc], [rfc, { name: 'Vejle Boldklub' }]));
    expect(v.ok).toBe(false);
    expect(v.grunde.join(' ')).toContain('Vejle Boldklub');
    expect(v.grunde.join(' ')).toMatch(/pulje-afregning/);
  });

  it('AFVISER et hold, der kommer til', () => {
    const v = teamsVagt(teamsPlan([rfc, { name: 'Vejle Boldklub' }], [rfc]));
    expect(v.ok).toBe(false);
    expect(v.grunde.join(' ')).toContain('Vejle Boldklub');
  });

  it('nævner ALLE grunde, ikke kun den første', () => {
    // Ét fund er ikke svaret; listen er. Stoppede vagten ved den første, ville
    // operatøren rette elo'en og støde på holdlisten i næste kørsel.
    const v = teamsVagt(teamsPlan(
      [{ ...rfc, elo: 1500 }, { name: 'Ny' }],
      [rfc, { name: 'Væk' }],
    ));
    expect(v.ok).toBe(false);
    expect(v.grunde).toHaveLength(3);
  });

  it('lader en omrokering ALENE passere — den er synlig, ikke farlig', () => {
    // Pulje-gitteret flytter sig, men ingen point ændrer sig. Den skal vises i
    // tør-kørslen, ikke spærre for skrivningen.
    const p = teamsPlan([{ name: 'B' }, { name: 'A' }], [{ name: 'A' }, { name: 'B' }]);
    expect(p.omrokeret).toBe(true);
    expect(teamsVagt(p).ok).toBe(true);
  });

  it('klarer en tom eller manglende plan uden at kaste', () => {
    expect(teamsVagt({ aendringer: [], tilfoejede: [], forsvundne: [] }).ok).toBe(true);
    expect(() => teamsVagt()).not.toThrow();
    expect(teamsVagt().ok).toBe(true);
  });
});

describe('teamsPlan — dybden er ægte, ikke en delt reference', () => {
  // FÆLDEN, DER BLEV FUNDET: de øvrige "uændret"-tests bygger `nuvaerende` med
  // `{ ...rfc }`, og et shallow spread deler `troejer`-OBJEKTET. Så var
  // `a === b` sand uden at sammenligne indhold, og hele dybde-sammenligningen
  // kunne fjernes med grøn suite — også testen, der hedder "ser en ændring
  // INDE I troejer". Den brugte nemlig altid en frisk literal, som pr.
  // konstruktion er en anden reference, uanset indholdet.
  //
  // Produktionen møder ALTID det, der testes her: Firestores snapshot og
  // datafilen deler aldrig en reference.
  const rfc = {
    name: 'Randers FC', elo: 1472, color: '#78C5ED',
    troejer: { hjemme: { sekundaer: '#30374F', moenster: 'skraabaand' } },
  };
  const uafhaengigKopi = (o) => JSON.parse(JSON.stringify(o));

  it('melder UÆNDRET på to strukturelt ens, men reference-forskellige objekter', () => {
    const p = teamsPlan([rfc], [uafhaengigKopi(rfc)]);
    expect(p.aendringer).toEqual([]);
    expect(p.uaendrede).toBe(1);
  });

  it('melder ÆNDRET, når kun et nested felt er forskelligt', () => {
    const gammel = uafhaengigKopi(rfc);
    gammel.troejer.hjemme.moenster = 'striber';
    const p = teamsPlan([rfc], [gammel]);
    expect(p.aendringer.map((a) => a.felt)).toEqual(['troejer']);
  });

  it('regner undefined som fravær også ét niveau NEDE', () => {
    // Den gamle test ramte kun det yderste felt, hvor `a === b` allerede giver
    // true for undefined mod undefined — nøglefiltreringen kom aldrig i spil.
    const medUndefined = uafhaengigKopi(rfc);
    medUndefined.troejer.hjemme.aerme = undefined;
    const p = teamsPlan([medUndefined], [uafhaengigKopi(rfc)]);
    expect(p.aendringer).toEqual([]);
  });
});

describe('teamsVagt — dubletter i filen', () => {
  it('AFVISER to rækker med samme navn', () => {
    // Både opslaget og "findes i filen"-sættet er på NAVN, så en dublet ser ud
    // som ét hold: hverken tilfoejede eller forsvundne fanger den. Listen ville
    // alligevel blive skrevet én række længere, og teams.length bærer
    // pulje-afregningen.
    const a = { name: 'A' };
    const b = { name: 'B' };
    const plan = teamsPlan([a, b, b], [a, b]);
    expect(plan.tilfoejede).toEqual([]);
    expect(plan.forsvundne).toEqual([]);
    expect(plan.dubletter).toEqual(['B']);
    const v = teamsVagt(plan);
    expect(v.ok).toBe(false);
    expect(v.grunde.join(' ')).toContain('to gange');
  });

  it('melder ikke en falsk omrokering, når en dublet gør længderne ulige', () => {
    // `faelles` filtrerer på navn, så dubletten gør efterOrden længere end
    // foerOrden. Uden længde-leddet ville `some` sammenligne forskudte lister.
    const plan = teamsPlan([{ name: 'A' }, { name: 'A' }, { name: 'B' }],
      [{ name: 'A' }, { name: 'B' }]);
    expect(plan.omrokeret).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OVERRIDES. Den fejl, der startede det hele: holdlisten var korrekt, og
// Randers stod alligevel i marine, fordi en override fra FØR farverne blev
// målt stadig vandt i badgeFor. Den er usynlig i fladen, indtil man står på
// præcis det felt.
// ---------------------------------------------------------------------------

describe('overrideAfvig', () => {
  const teams = [
    { name: 'Randers FC', color: '#78C5ED', awayColor: '#33384F', thirdColor: '#FC8033' },
    { name: 'AGF', color: '#0B4EA2', awayColor: '#FFFFFF', thirdColor: '#111111' },
  ];

  it('finder den override, der afviger — og siger hvad listen mener', () => {
    const styles = { 'Randers FC': { thirdColor: '#003C7E' } };
    const r = overrideAfvig(styles, teams);
    expect(r.afvig).toEqual([{
      name: 'Randers FC', felt: 'thirdColor', etiket: 'tredje',
      override: '#003C7E', liste: '#FC8033',
    }]);
  });

  it('melder IKKE en override, der er lig holdlisten', () => {
    // Fanen gemmer kun afvigende felter, men et gammelt dokument kan have et
    // felt, listen siden har indhentet. Det er ikke en afvigelse.
    const r = overrideAfvig({ 'Randers FC': { thirdColor: '#FC8033' } }, teams);
    expect(r.afvig).toEqual([]);
  });

  it('regner STORE og små bogstaver som samme farve', () => {
    // Ellers ville "#fc8033" mod "#FC8033" stå som en afvigelse, ejeren ikke
    // kan se på skærmen — og han ville lede efter en forskel, der ikke findes.
    const r = overrideAfvig({ 'Randers FC': { thirdColor: '#fc8033' } }, teams);
    expect(r.afvig).toEqual([]);
  });

  it('tager ALLE tre farvefelter med', () => {
    const styles = { AGF: { color: '#000000', awayColor: '#EEEEEE', thirdColor: '#123456' } };
    expect(overrideAfvig(styles, teams).afvig.map((a) => a.felt))
      .toEqual(['awayColor', 'color', 'thirdColor']);
  });

  it('melder en override på et felt, holdlisten IKKE har', () => {
    // Datafilen beder selv ejeren sætte Leeds' og Spurs' tredjetrøjer i admin,
    // fordi de ikke var udkommet. De skal med — men som "listen har ingen
    // værdi", ikke som en fejl.
    const uden = [{ name: 'Leeds United', color: '#FFFFFF' }];
    const r = overrideAfvig({ 'Leeds United': { thirdColor: '#FFD700' } }, uden);
    expect(r.afvig).toEqual([{
      name: 'Leeds United', felt: 'thirdColor', etiket: 'tredje',
      override: '#FFD700', liste: undefined,
    }]);
  });

  it('samler overrides på hold, der slet ikke er i listen, FOR SIG', () => {
    // De ryddes, næste gang nogen gemmer i admin-fanen. Det skal siges, FØR
    // det sker i tavshed — ikke opdages bagefter.
    const r = overrideAfvig({ 'Vejle Boldklub': { color: '#E4002B' } }, teams);
    expect(r.ukendte).toEqual(['Vejle Boldklub']);
    expect(r.afvig).toEqual([]);
  });

  it('springer tomme og ikke-tekstlige værdier over', () => {
    const styles = { 'Randers FC': { color: '', awayColor: null, thirdColor: 42 } };
    expect(overrideAfvig(styles, teams).afvig).toEqual([]);
  });

  it('sorterer, så to kørsler kan sammenlignes', () => {
    const styles = {
      AGF: { thirdColor: '#999999' },
      'Randers FC': { color: '#111111' },
    };
    expect(overrideAfvig(styles, teams).afvig.map((a) => a.name)).toEqual(['AGF', 'Randers FC']);
  });

  it('klarer manglende input uden at kaste', () => {
    expect(overrideAfvig(null, null)).toEqual({ afvig: [], ukendte: [] });
    expect(() => overrideAfvig()).not.toThrow();
  });
});
