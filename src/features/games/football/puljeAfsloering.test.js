import { describe, it, expect } from 'vitest';
import {
  erAfgjort, holdTilslutning, puljeRangliste, puljeVindere,
} from './puljeAfsloering';

const VALG = { antal: 3, perTeam: 4, perfectBonus: 10 };
const HOLD = [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }];
const FACIT = { top: ['A', 'B', 'C'], bund: null };

describe('erAfgjort — én kilde til tallet, aldrig to', () => {
  it('afgjort først når ALLE dokumenter har serverens correct', () => {
    expect(erAfgjort([{ correct: 3 }, { correct: 1 }])).toBe(true);
    expect(erAfgjort([{ correct: 3 }, {}])).toBe(false);
    // 0 rigtige er et RIGTIGT svar — feltet findes, så det tæller som afgjort.
    expect(erAfgjort([{ correct: 0 }])).toBe(true);
  });

  it('et TOMT felt er ikke afgjort — [].every() er sand', () => {
    // Uden vagten ville en tom liste blive kaldt endelig, og fladen ville
    // sige "afgjort" om et spil, hvor ingen har tippet.
    expect(erAfgjort([])).toBe(false);
    expect(erAfgjort(null)).toBe(false);
  });

  it('en ikke-numerisk correct tæller ikke som afgjort', () => {
    expect(erAfgjort([{ correct: null }])).toBe(false);
    expect(erAfgjort([{ correct: '3' }])).toBe(false);
  });
});

describe('holdTilslutning — konsensus og enegængere på HELE spillet', () => {
  const BETS = [
    { uid: 'u1', championship: ['A', 'B', 'C'] },
    { uid: 'u2', championship: ['A', 'B', 'D'] },
    { uid: 'u3', championship: ['A', 'B', 'C'] },
  ];

  it('tæller pr. hold og sorterer efter tilslutning', () => {
    const r = holdTilslutning(BETS, HOLD);
    expect(r.map((x) => [x.navn, x.antal])).toEqual([
      ['A', 3], ['B', 3], ['C', 2], ['D', 1],
    ]);
  });

  it('lige tilslutning brydes på NAVN — uanset holdenes rækkefølge i spillet', () => {
    // Holdene gives BAGLÆNS. En stabil sortering uden navne-tiebreak ville
    // beholde den rækkefølge og stå grøn på fixturen ovenfor, hvor holdene
    // allerede står alfabetisk (Test Manager-fund).
    const baglaens = [{ name: 'C' }, { name: 'B' }, { name: 'A' }];
    const r = holdTilslutning([{ uid: 'u1', championship: ['B', 'C'] }, { uid: 'u2', championship: ['B', 'C'] }], baglaens);
    expect(r.map((x) => x.navn)).toEqual(['B', 'C', 'A']);
    expect(holdTilslutning([], baglaens).map((x) => x.navn)).toEqual(['A', 'B', 'C']);
  });

  it('udpeger enegængeren — og KUN når præcis én har valgt holdet', () => {
    const r = holdTilslutning(BETS, HOLD);
    expect(r.find((x) => x.navn === 'D').enesteUid).toBe('u2');
    expect(r.find((x) => x.navn === 'C').enesteUid).toBeNull();
    expect(r.find((x) => x.navn === 'A').enesteUid).toBeNull();
  });

  it('et hold, INGEN har valgt, står med 0 og uden enegænger', () => {
    const r = holdTilslutning([{ uid: 'u1', championship: ['A'] }], HOLD);
    const d = r.find((x) => x.navn === 'D');
    expect(d.antal).toBe(0);
    expect(d.enesteUid).toBeNull();
  });

  it('et dublet-hold i ét tip tæller ÉN gang', () => {
    // Reglerne burde forhindre det, men et gammelt dokument kunne bære det,
    // og en enegænger, der talte sig selv to gange, ville forsvinde.
    const r = holdTilslutning([{ uid: 'u1', championship: ['A', 'A'] }], HOLD);
    expect(r.find((x) => x.navn === 'A').antal).toBe(1);
    expect(r.find((x) => x.navn === 'A').enesteUid).toBe('u1');
  });

  it('tåler tip uden championship', () => {
    expect(() => holdTilslutning([{ uid: 'u1' }, { uid: 'u2', championship: null }], HOLD)).not.toThrow();
    expect(holdTilslutning([{ uid: 'u1' }], HOLD).every((x) => x.antal === 0)).toBe(true);
  });
});

describe('puljeRangliste — én liga ad gangen', () => {
  const MEDLEMMER = [
    { uid: 'u1', name: 'Anna' }, { uid: 'u2', name: 'Bo' }, { uid: 'u3', name: 'Carla' },
  ];
  const BETS = [
    { uid: 'u1', championship: ['A', 'B', 'C'] },  // 3 rigtige
    { uid: 'u2', championship: ['A', 'D', 'D'] },  // 1 rigtig
    { uid: 'u9', championship: ['A', 'B', 'C'] },  // uden for ligaen
  ];

  it('skærer mod ligaens medlemmer — en fremmed kommer ikke med', () => {
    const r = puljeRangliste(BETS, MEDLEMMER, FACIT, VALG);
    expect(r.map((x) => x.uid)).toEqual(['u1', 'u2', 'u3']);
    expect(r.some((x) => x.uid === 'u9')).toBe(false);
  });

  it('"tippede ikke" er IKKE "0 rigtige" — og ligger sidst', () => {
    const r = puljeRangliste(BETS, MEDLEMMER, FACIT, VALG);
    const carla = r.find((x) => x.uid === 'u3');
    expect(carla.tippede).toBe(false);
    expect(carla.rigtige).toBeNull();     // ikke 0
    expect(carla.point).toBeNull();
    expect(r[r.length - 1].uid).toBe('u3');
  });

  it('en, der tippede og ramte NUL, ligger FØR en, der ikke tippede', () => {
    const r = puljeRangliste(
      [{ uid: 'u2', championship: ['D', 'D', 'D'] }], MEDLEMMER, FACIT, VALG,
    );
    expect(r[0].uid).toBe('u2');
    expect(r[0].tippede).toBe(true);
    expect(r[0].rigtige).toBe(0);
  });

  it('to UDEN tip står i navneorden — uanset rækkefølgen i ligaen', () => {
    const r = puljeRangliste([], [MEDLEMMER[2], MEDLEMMER[1]], FACIT, VALG);
    expect(r.map((x) => x.navn)).toEqual(['Bo', 'Carla']);
  });

  it('sorterer efter point, så rigtige, så navn', () => {
    const r = puljeRangliste(BETS, MEDLEMMER, FACIT, VALG);
    expect(r[0].navn).toBe('Anna');
    expect(r[0].rigtige).toBe(3);
    expect(r[0].point).toBe(3 * 4 + 10);   // perfekt række
    expect(r[1].navn).toBe('Bo');
    expect(r[1].rigtige).toBe(1);
    expect(r[1].point).toBe(4);
  });

  it('to med SAMME tal står i navneorden — uanset rækkefølgen i ligaen', () => {
    // Medlemmerne gives baglæns (Carla, Bo), begge med 2 rigtige. En stabil
    // sortering uden navne-tiebreak ville beholde Carla først.
    const bets = [
      { uid: 'u3', championship: ['A', 'B', 'D'] },
      { uid: 'u2', championship: ['A', 'B', 'D'] },
    ];
    const r = puljeRangliste(bets, [MEDLEMMER[2], MEDLEMMER[1]], FACIT, VALG);
    expect(r.map((x) => x.navn)).toEqual(['Bo', 'Carla']);
  });

  it('POINT går forud for rigtige (perfekt-bonus skiller), rigtige forud for navn', () => {
    // Serverens tal kan skille på point, hvor rigtige er ens — og omvendt.
    // Navnene er valgt, så alfabetet peger den MODSATTE vej af tallene.
    const medlemmer = [{ uid: 'u1', name: 'Anna' }, { uid: 'u2', name: 'Bo' }];
    const paaPoint = [
      { uid: 'u1', championship: [], correct: 3, points: 12 },
      { uid: 'u2', championship: [], correct: 3, points: 22 },
    ];
    expect(puljeRangliste(paaPoint, medlemmer, FACIT, VALG, true).map((x) => x.navn)).toEqual(['Bo', 'Anna']);
    const paaRigtige = [
      { uid: 'u1', championship: [], correct: 1, points: 8 },
      { uid: 'u2', championship: [], correct: 2, points: 8 },
    ];
    expect(puljeRangliste(paaRigtige, medlemmer, FACIT, VALG, true).map((x) => x.navn)).toEqual(['Bo', 'Anna']);
  });

  it('AFGJORT bruger serverens tal, ikke klientens regnestykke', () => {
    // De to kan være uenige — serveren afregner først, når alle KAMPE har
    // mål, klienten regner så snart tabellen er komplet.
    const afgjorteBets = [{ uid: 'u1', championship: ['A', 'B', 'C'], correct: 2, points: 8 }];
    const r = puljeRangliste(afgjorteBets, MEDLEMMER, FACIT, VALG, true);
    expect(r[0].rigtige).toBe(2);   // serverens 2, ikke klientens 3
    expect(r[0].point).toBe(8);
  });

  describe('bunden tæller med (PL: top OG bund)', () => {
    const VALG_PL = { ...VALG, nedSize: 2 };
    const FACIT_PL = { top: ['A', 'B', 'C'], bund: ['X', 'Y'] };
    const medlemmer = [{ uid: 'u1', name: 'Anna' }];

    it('lige nu: rigtige og point er SUMMEN af begge spørgsmål', () => {
      const bets = [{ uid: 'u1', championship: ['A', 'B', 'C'], relegation: ['X', 'Z'] }];
      const [r] = puljeRangliste(bets, medlemmer, FACIT_PL, VALG_PL);
      expect(r.rigtige).toBe(3 + 1);
      expect(r.point).toBe((3 * 4 + 10) + 1 * 4);   // top perfekt +10, bund 1 rigtig
    });

    it('lige nu: en perfekt BUND giver sin egen bonus — som på serveren', () => {
      const bets = [{ uid: 'u1', championship: ['D', 'D', 'D'], relegation: ['X', 'Y'] }];
      const [r] = puljeRangliste(bets, medlemmer, FACIT_PL, VALG_PL);
      expect(r.rigtige).toBe(2);
      expect(r.point).toBe(2 * 4 + 10);
    });

    it('afgjort: serverens nedCorrect/nedPoints lægges til', () => {
      const bets = [{ uid: 'u1', championship: [], correct: 3, points: 22, nedCorrect: 1, nedPoints: 4 }];
      const [r] = puljeRangliste(bets, medlemmer, FACIT_PL, VALG_PL, true);
      expect(r.rigtige).toBe(4);
      expect(r.point).toBe(26);
    });

    it('afgjort UDEN bund-felter (SL-dokument): kun toppen — ingen NaN', () => {
      const bets = [{ uid: 'u1', championship: [], correct: 2, points: 8 }];
      const [r] = puljeRangliste(bets, medlemmer, FACIT, VALG, true);
      expect(r.rigtige).toBe(2);
      expect(r.point).toBe(8);
    });

    it('et spil UDEN bund ignorerer et relegation-felt, selv med bund-facit', () => {
      const bets = [{ uid: 'u1', championship: ['A', 'B', 'C'], relegation: ['X', 'Y'] }];
      const [r] = puljeRangliste(bets, medlemmer, FACIT_PL, VALG);   // nedSize mangler → 0
      expect(r.rigtige).toBe(3);
      expect(r.point).toBe(22);
    });

    it('bund UDEN bund-facit (tabellen har ikke nok hold endnu) tæller 0, ikke fejl', () => {
      const bets = [{ uid: 'u1', championship: ['A', 'B', 'C'], relegation: ['X', 'Y'] }];
      const [r] = puljeRangliste(bets, medlemmer, { top: ['A', 'B', 'C'], bund: null }, VALG_PL);
      expect(r.rigtige).toBe(3);
      expect(r.point).toBe(22);
    });
  });
});

describe('puljeVindere — sæsonens udbetaling', () => {
  const R = (uid, navn, rigtige, point) => ({ uid, navn, tippede: true, rigtige, point });

  it('kårer på POINT — perfekt-bonussen skiller to med samme antal rigtige', () => {
    expect(puljeVindere([R('a', 'Anna', 3, 12), R('b', 'Bo', 3, 22)]).map((x) => x.navn))
      .toEqual(['Bo']);
    // Og omvendt: flest rigtige vinder IKKE, hvis pointene siger noget andet.
    expect(puljeVindere([R('a', 'Anna', 5, 20), R('b', 'Bo', 3, 22)]).map((x) => x.navn))
      .toEqual(['Bo']);
  });

  it('DELT førsteplads navngiver alle — en delt sejr er stadig en sejr', () => {
    expect(puljeVindere([R('a', 'Anna', 4, 16), R('b', 'Bo', 4, 16), R('c', 'C', 1, 4)]).map((x) => x.navn))
      .toEqual(['Anna', 'Bo']);
  });

  it('ingen vinder, når ingen ramte noget — nul er ikke en sejr', () => {
    expect(puljeVindere([R('a', 'Anna', 0, 0), R('b', 'Bo', 0, 0)])).toBeNull();
  });

  it('ingen vinder uden tip', () => {
    expect(puljeVindere([{ uid: 'a', navn: 'Anna', tippede: false, rigtige: null, point: null }])).toBeNull();
    expect(puljeVindere([])).toBeNull();
  });
});
