import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  DEFAULT_POINTS, COMBI, round1, outcomeReward, roundComboBonus,
  isOutcome, outcomeFromScore, outcomePoints, settleChance, scoreBet, clampStake, CHANCE, TRAEF_BONUS,
  hitPoints,
  PULJE, ELO, ODDS,
  outcomeOdds, updateElo, actualHomeFromOutcome, outcomeProbabilities, fairOdds,
  leagueTable, championshipTeams, puljeScore, bundTeams, puljeKonfig,
  STANDARD_SPORT, SPORT_PROFILER, sportProfil, oddsParametre, eloParametre,
} = require('./superligaScoring');

describe('superligaScoring (server-spejl)', () => {
  it('1X2-point følger kampens odds (1 decimal)', () => {
    const odds = { '1': 3.12, X: 4.27, '2': 2.25 };
    // Point = kampens odds (træf-bonussen er 0). Bonussen findes, fordi rene fair odds
    // gør alle strategier lige gode — se hitPoints i superligaScoring.js.
    expect(outcomePoints('1', '1', odds)).toBe(3.1);
    expect(outcomePoints('X', 'X', odds)).toBe(4.3);
    expect(outcomePoints('2', '2', odds)).toBe(2.3);
  });

  // Samme værn som i klientens testfil: med bonussen på 0 er hitPoints og
  // outcomeReward ENS, så `+ bonus` kunne fjernes helt fra serveren uden at
  // én test blev rød — og så ville combi'en og 1X2-pointene være samme
  // funktion, næste gang skruen sættes. Injicér en værdi ≠ 0 og bind skellet.
  it('lægger en injiceret bonus til, mens outcomeReward står stille', () => {
    const odds = { '1': 3.12, X: 4.27, '2': 2.25 };
    expect(hitPoints('1', odds)).toBe(3.1);
    expect(hitPoints('1', odds, 1)).toBe(4.1);
    expect(hitPoints('1', odds, 0.5)).toBe(3.6);
    expect(outcomeReward('1', odds)).toBe(3.1);
    expect(outcomePoints('1', 'X', odds)).toBe(0);
    expect(round1(4.27)).toBe(4.3);
    expect(outcomeReward('X', null)).toBe(DEFAULT_POINTS.X);
  });

  it('udleder udfald af mål', () => {
    expect(outcomeFromScore(2, 0)).toBe('1');
    expect(outcomeFromScore(1, 1)).toBe('X');
    expect(outcomeFromScore(0, 2)).toBe('2');
    expect(outcomeFromScore(null, 1)).toBeNull();
  });

  it('validerer udfald', () => {
    expect(isOutcome('X')).toBe(true);
    expect(isOutcome('3')).toBe(false);
  });

  // Spejlet skal give NØJAGTIG samme tal som src/lib — ellers siger stillingen
  // ét og fladen et andet. Samme tilfælde som i klientens testfil.
  it('roundComboBonus: 2 × kvadratroden, loft 25, hver ramt kamp tæller (spejl)', () => {
    expect(roundComboBonus([1.5, 1.5, 1.5, 1.5, 1.5, 1.5], 6)).toBe(6.8);  // 2·√11,4
    expect(roundComboBonus([2.1, 2.1, 2.1, 2.1, 2.1, 2.1], 6)).toBe(18.5); // favoritter, under loft
    expect(roundComboBonus([4, 4, 4, 4, 4, 4], 6)).toBe(COMBI.LOFT); // outsidere → 25
    expect(roundComboBonus([2, 2, 2, 2], 6)).toBe(8);   // to fejl betaler nu
    expect(roundComboBonus([2, 2, 2], 6)).toBe(5.7);    // tre fejl også
    expect(roundComboBonus([2.1], 6)).toBe(0);          // én ramt er ingen kupon
    // Et LIGE antal negative odds giver et POSITIVT produkt og ville slippe
    // igennem en vagt, der stod på produktet. Vagten står på hvert odds.
    expect(roundComboBonus([-2, -3], 2)).toBe(0);
    expect(roundComboBonus([-2, 3], 2)).toBe(0);
    expect(roundComboBonus([0, 3], 2)).toBe(0);
    expect(round1(2.25)).toBe(2.3);                     // round1 er uændret
  });

  it('pulje-tip: slutstilling + score (spejl)', () => {
    const matches = [
      { home: 'A', away: 'B', homeGoals: 2, awayGoals: 0 },
      { home: 'A', away: 'C', homeGoals: 1, awayGoals: 0 },
      { home: 'B', away: 'C', homeGoals: 3, awayGoals: 1 },
    ];
    expect(leagueTable(matches).map((r) => r.name)).toEqual(['A', 'B', 'C']);
    expect(championshipTeams(matches, 2)).toEqual(['A', 'B']);
    const top6 = ['A', 'B', 'C', 'D', 'E', 'F'];
    expect(puljeScore(['A', 'B', 'C', 'D', 'E', 'X'], top6)).toEqual({ correct: 5, points: 20 });
  });

  it('settleChance: gevinst = indsats×(odds−1), tab = −indsats, ingen bøde', () => {
    expect(settleChance({ correct: true, stake: 5, fairOdds: 3 })).toEqual({ delta: 10, profit: 10 });
    expect(settleChance({ correct: false, stake: 5, fairOdds: 3 })).toEqual({ delta: -5, profit: 0 });
    expect(settleChance({ correct: true, stake: 0, fairOdds: 3 })).toEqual({ delta: 0, profit: 0 });
  });

  it('settleChance: en forfalsket indsats klippes til det absolutte loft', () => {
    // Klienten begrænser indsatsen, men klienten kan omgås — serveren er
    // eneste autoritet. Uden loft ville dette give 1.999.998 point.
    const huge = settleChance({ correct: true, stake: 1000000, fairOdds: 3 });
    expect(huge.delta).toBe(CHANCE.MAX_ABS * 2); // 8 × (3−1)
    // Tabet er tilsvarende begrænset.
    expect(settleChance({ correct: false, stake: 1000000, fairOdds: 3 }).delta).toBe(-CHANCE.MAX_ABS);
  });

  it('clampStake: heltal, aldrig negativ, og saldo-andelen når saldoen kendes', () => {
    expect(clampStake(3)).toBe(3);
    expect(clampStake(99)).toBe(CHANCE.MAX_ABS);
    expect(clampStake(-5)).toBe(0);
    expect(clampStake(2.9)).toBe(2);
    expect(clampStake('nej')).toBe(0);
    // 15 % af 20 point = 3 → en indsats på 8 klippes til 3.
    expect(clampStake(8, 20)).toBe(3);
    // Uden point kan man ikke bruge Chancen.
    expect(clampStake(5, 0)).toBe(0);
  });

  it('scoreBet: en forfalsket indsats kan ikke give absurd mange point', () => {
    const pts = scoreBet({ pick: '1', chanceStake: 1000000 }, '1', { '1': 3 });
    expect(pts).toBe(3 + TRAEF_BONUS + CHANCE.MAX_ABS * 2); // 1X2-point (odds) + loftet gevinst
  });

  describe('scoreBet (1X2 + Chancen samlet)', () => {
    it('uden chance = kun 1X2-point (= odds, 1 decimal)', () => {
      expect(scoreBet({ pick: 'X', chanceStake: 0 }, 'X', { X: 4.27 })).toBe(4.3);
      expect(scoreBet({ pick: '1', chanceStake: 0 }, '2', { '1': 2.5 })).toBe(0);
    });
    it('uden odds falder base tilbage til standard', () => {
      expect(scoreBet({ pick: 'X', chanceStake: 0 }, 'X')).toBe(4);
    });
    it('med chance og ramt: base(odds) + gevinst', () => {
      // pick X rammer med odds 3: base (odds 3,0) + 8×(3−1)=16 → 20.
      // Chancen afregnes til de RENE odds — træf-bonussen ganges ikke med.
      expect(scoreBet({ pick: 'X', chanceStake: 8 }, 'X', { X: 3 })).toBe(19);
    });
    it('med chance og forbi: 0 base − indsats', () => {
      expect(scoreBet({ pick: '1', chanceStake: 5 }, '2', { 1: 2 })).toBe(-5);
    });
    it('uden gyldige odds afregnes chancen ikke (kun fallback-base)', () => {
      expect(scoreBet({ pick: '1', chanceStake: 5 }, '1', null)).toBe(2);
      expect(scoreBet({ pick: '1', chanceStake: 5 }, '1', {})).toBe(2);
    });
  });

  describe('Elo/odds', () => {
    it('opdaterer Elo nulsum (vinder op, taber ned)', () => {
      const { home, away } = updateElo(1500, 1500, 1);
      expect(home).toBeGreaterThan(1500);
      expect(away).toBeLessThan(1500);
      expect((home - 1500) + (away - 1500)).toBeCloseTo(0, 6);
    });
    it('actualHome oversætter udfald', () => {
      expect(actualHomeFromOutcome('1')).toBe(1);
      expect(actualHomeFromOutcome('X')).toBe(0.5);
      expect(actualHomeFromOutcome('2')).toBe(0);
    });
    it('favorit hjemme → lav hjemme-odds', () => {
      const o = outcomeOdds({ eloHome: 1900, eloAway: 1300 });
      expect(o['1']).toBeLessThan(o['2']);
    });
    it('sandsynligheder summer til 1', () => {
      const p = outcomeProbabilities({ eloHome: 1600, eloAway: 1450 });
      expect(p['1'] + p.X + p['2']).toBeCloseTo(1, 6);
    });
  });

  it('server-spejl matcher src-udgaven (point, chance, odds, elo)', async () => {
    const src = await import('../src/lib/superligaScoring.js');
    const odds = { '1': 3.12, X: 4.27, '2': 2.25 };
    for (const [pick, result] of [['1', '1'], ['X', 'X'], ['2', '2'], ['1', 'X']]) {
      expect(outcomePoints(pick, result, odds)).toBe(src.outcomePoints(pick, result, odds));
    }
    expect(settleChance({ correct: true, stake: 6, fairOdds: 2.5 }).delta)
      .toBe(src.settleChance({ correct: true, stake: 6, fairOdds: 2.5 }).delta);
    // Combi-runde-bonus identisk med frontend-biblioteket.
    expect(roundComboBonus([2.2, 3.1, 1.8, 4.3, 2.0, 1.5], 6))
      .toBe(src.roundComboBonus([2.2, 3.1, 1.8, 4.3, 2.0, 1.5], 6));
    // Pulje-score identisk.
    const top6 = ['A', 'B', 'C', 'D', 'E', 'F'];
    expect(puljeScore(['A', 'B', 'C', 'X', 'Y', 'Z'], top6))
      .toEqual(src.puljeScore(['A', 'B', 'C', 'X', 'Y', 'Z'], top6));
    // PL-formen (#8): valgfrie antal/point OG konfig-normalizeren spejles.
    const plValg = { antal: 3, perTeam: 4, perfectBonus: 10 };
    expect(puljeScore(['A', 'B', 'C'], top6, plValg)).toEqual(src.puljeScore(['A', 'B', 'C'], top6, plValg));
    const kampe = [
      { home: 'A', away: 'B', homeGoals: 2, awayGoals: 0 },
      { home: 'C', away: 'D', homeGoals: 0, awayGoals: 1 },
    ];
    expect(bundTeams(kampe, 2)).toEqual(src.bundTeams(kampe, 2));
    for (const g of [{ pulje: { poolSize: 6 } }, { pulje: { poolSize: 4, nedSize: 3, facitKilde: 'egneKampe', tabelDeling: false } }, {}]) {
      expect(puljeKonfig(g)).toEqual(src.puljeKonfig(g));
    }
    // Superligaens LITERALE dokument giver PRÆCIS dagens adfærd — bliver
    // dette bånd rødt, har en default flyttet sig under SL.
    expect(puljeKonfig({ pulje: { poolSize: 6 } })).toMatchObject({
      poolSize: 6, nedSize: 0, perTeam: 4, perfectBonus: 10, facitKilde: 'officiel', tabelDeling: true,
    });
    // poolSize-FALLBACKEN (TM-fund: hvert test-objekt satte poolSize eksplicit,
    // så selve grenen blev aldrig ramt). Et pulje-objekt uden poolSize skal
    // falde til PULJE.POOL_SIZE — spejlene ens.
    expect(puljeKonfig({ pulje: {} }).poolSize).toBe(src.PULJE.POOL_SIZE);
    expect(puljeKonfig({ pulje: { nedSize: 3 } }).poolSize).toBe(src.PULJE.POOL_SIZE);
    expect(puljeKonfig({ pulje: {} })).toEqual(src.puljeKonfig({ pulje: {} }));
    // Odds + Elo identisk med frontend-biblioteket.
    const args = { eloHome: 1623, eloAway: 1458 };
    expect(outcomeOdds(args)).toEqual(src.outcomeOdds(args));
    expect(updateElo(1574, 1521, 1)).toEqual(src.updateElo(1574, 1521, 1));

    // Slutstillingens tie-break afgør puljen (6./7.-pladsen) og er et oplagt
    // sted for drift mellem ESM og CommonJS — dansk localeCompare til sidst.
    const tied = [
      { home: 'Æble', away: 'Bo', homeGoals: 1, awayGoals: 1 },
      { home: 'Anders', away: 'Åge', homeGoals: 1, awayGoals: 1 },
      { home: 'Bo', away: 'Anders', homeGoals: 0, awayGoals: 0 },
      { home: 'Åge', away: 'Æble', homeGoals: 2, awayGoals: 2 },
    ];
    expect(leagueTable(tied).map((r) => r.name)).toEqual(src.leagueTable(tied).map((r) => r.name));
    expect(championshipTeams(tied, 2)).toEqual(src.championshipTeams(tied, 2));

    // Konstanterne skal også være ens — et loft der kun ændres ét sted er
    // præcis den slags drift, ingen opdager før pointene er forkerte.
    expect(COMBI).toEqual(src.COMBI);
    expect(CHANCE).toEqual(src.CHANCE);
    expect(PULJE).toEqual(src.PULJE);
    expect(ELO).toEqual(src.ELO);
    // TRAEF_BONUS og DEFAULT_POINTS er de to, der afgør point pr. RAMT kamp.
    // Drifter de mellem spejlene, viser stillingen ét tal og tip-fladen et
    // andet — og ingen af de øvrige assertions ville sige fra.
    expect(TRAEF_BONUS).toBe(src.TRAEF_BONUS);
    expect(DEFAULT_POINTS).toEqual(src.DEFAULT_POINTS);
    // ODDS manglede på listen ovenfor, selv om kommentaren nævner netop "et
    // loft". Blindvinklen var reel: med src på 100,0 og serveren på 8,0 kørte
    // hele suiten grøn, fordi odds-sammenligningen nedenfor bruger et
    // jævnbyrdigt opgør, hvor loftet aldrig binder.
    expect(ODDS).toEqual(src.ODDS);
  });

  // Sammenligningen SKAL ramme klippet. Et jævnbyrdigt opgør beviser kun, at
  // de to spejle kan dividere ens — ikke at de klipper ens.
  it('server-spejlet klipper ved samme loft som src', async () => {
    const src = await import('../src/lib/superligaScoring.js');
    // Så stort et mismatch, at udesejren ryger i loftet ved ethvert realistisk
    // loft. Findes ikke i Superligaen (højeste fair odds dér er 7,80) — og det
    // er netop pointen: loftet er et værn mod det ekstreme.
    // ET UDEFAVORIT-PAR ER OBLIGATORISK. Alle tidligere sammenligninger brugte
    // hjemmefavoritter, hvor `Math.abs` i skew-udregningen er en no-op — så
    // kunne den fjernes på serveren uden at én af 317 tests sagde fra, mens
    // hver eneste udefavorit fik uafgjort prissat til 58 % i stedet for 16 %.
    for (const par of [
      { eloHome: 1900, eloAway: 1200 },   // ekstrem hjemmefavorit
      { eloHome: 1390, eloAway: 1620 },   // UDEFAVORIT — den, der fangede hullet
      { eloHome: 1500, eloAway: 1500 },   // lige hold
    ]) {
      expect(outcomeOdds(par)).toEqual(src.outcomeOdds(par));
      expect(outcomeProbabilities(par)).toEqual(src.outcomeProbabilities(par));
    }
  });

  // fairOdds SKAL sammenlignes på RÅ input, ikke kun gennem Elo-par. Elo kan
  // ikke producere p ≤ 0 og heller ikke p over 0,896 — så hverken vagten mod
  // ugyldige værdier eller gulvet bliver nogensinde rørt ad den vej. Målt:
  // `prob <= 0` kunne svækkes til `prob < 0` på serveren alene, og gulvet
  // kunne fjernes, med alle 318 tests grønne. Mutanten returnerede Infinity
  // for fairOdds(0) — præcis det, UGYLDIG findes for at forhindre.
  it('server-spejlets fairOdds er identisk med src på rå input', async () => {
    const src = await import('../src/lib/superligaScoring.js');
    for (const p of [0, -1, -0.5, 'x', NaN, null, undefined, 0.999, 0.99, 0.95, 0.5, 0.25, 0.05, 0.01, 0.001]) {
      expect(fairOdds(p)).toBe(src.fairOdds(p));
      expect(Number.isFinite(fairOdds(p))).toBe(true);
    }
    // Og gulvet skal faktisk gribe — med literaler, så det ikke kan hæves
    // sammen med konstanten uden at noget bliver rødt.
    expect(fairOdds(0.99)).toBe(1.1);
    expect(ODDS.MIN).toBe(1.1);
    expect(fairOdds(0)).toBe(ODDS.UGYLDIG);
  });
});

// Sportsprofilen er spejlet. Driver den, prisser seedet (klienten) og
// omprisningen (serveren) samme spil med to modeller — og den første
// omprisning flytter alle odds, uden at nogen har bedt om det.
describe('sportsprofilen: server-spejlet er identisk med src', () => {
  // Spil, der rammer hver gren: mangler, ukendt, ugyldig, prototype-navne.
  const SPIL = [
    undefined, null, {}, { sport: 'fodbold' }, { sport: 'curling' }, { sport: 'Fodbold' },
    { sport: 123 }, { sport: '' }, { sport: 'toString' }, { sport: '__proto__' }, { sport: 'constructor' },
  ];

  it('samme register, samme standard, samme profil for hvert spil', async () => {
    const src = await import('../src/lib/superligaScoring.js');
    expect(STANDARD_SPORT).toBe(src.STANDARD_SPORT);
    expect(SPORT_PROFILER).toEqual(src.SPORT_PROFILER);
    expect(Object.keys(SPORT_PROFILER)).toEqual(['fodbold']); // ingen håndbold før delopgave 4
    for (const g of SPIL) {
      expect(sportProfil(g), JSON.stringify(g)).toEqual(src.sportProfil(g));
      // Ikke bare ens med src — det SKAL være fodbold. Ellers ville to spejle,
      // der begge gav Object.prototype for '__proto__', også være "ens".
      expect(sportProfil(g), JSON.stringify(g)).toBe(SPORT_PROFILER.fodbold);
    }
    expect(sportProfil()).toBe(SPORT_PROFILER.fodbold);
  });

  it('fodbold er bygget af ELO/ODDS, har dagens tal og er frosset', () => {
    const p = sportProfil();
    expect(p).toEqual({ sport: 'fodbold', elo: { ...ELO }, odds: { min: ODDS.MIN } });
    // En KOPI — delte profilen objekt med ELO, blev konstanten selv frosset.
    expect(p.elo).not.toBe(ELO);
    expect(Object.isFrozen(ELO)).toBe(false);
    expect(p.elo).toEqual({ START: 1500, HFA: 60, K: 20, DRAW_BASE: 0.305, DRAW_DECAY: 0.55 });
    expect(Object.isFrozen(p) && Object.isFrozen(p.elo) && Object.isFrozen(p.odds)).toBe(true);
  });

  it('samme oversættelse til odds- og Elo-parametre — også for en profil med andre tal', async () => {
    const src = await import('../src/lib/superligaScoring.js');
    const anden = { elo: { START: 1000, HFA: 0, K: 40, DRAW_BASE: 0.05, DRAW_DECAY: 0.2 }, odds: { min: 1.01 } };
    for (const p of [sportProfil(), anden]) {
      expect(oddsParametre(p)).toEqual(src.oddsParametre(p));
      expect(eloParametre(p)).toEqual(src.eloParametre(p));
    }
    expect(oddsParametre(anden)).toEqual({ hfa: 0, drawBase: 0.05, drawDecay: 0.2, oddsMin: 1.01 });
    expect(eloParametre(anden)).toEqual({ hfa: 0, k: 40 });
    expect(oddsParametre()).toEqual(src.oddsParametre());
    expect(eloParametre()).toEqual(src.eloParametre());
  });

  // Gulvet som profilværdi SKAL sammenlignes, hvor det binder. Fodbold kan
  // ikke nå over p = 0,909 (se ODDS i src), så et jævnt par ville kun bevise,
  // at begge spejle kan dividere.
  it('outcomeOdds bruger oddsMin ens — der, hvor gulvet binder', async () => {
    const src = await import('../src/lib/superligaScoring.js');
    const args = { eloHome: 1900, eloAway: 1300, hfa: 0, drawBase: 0.05, drawDecay: 0.2 };
    for (const oddsMin of [undefined, 1.01, 1.1, 1.2]) {
      expect(outcomeOdds({ ...args, oddsMin })).toEqual(src.outcomeOdds({ ...args, oddsMin }));
    }
    expect(outcomeOdds({ ...args, oddsMin: 1.01 })['1']).toBe(1.07);
    expect(outcomeOdds(args)['1']).toBe(1.1);
    for (const p of [0, -1, 'x', 0.99, 0.95, 0.5]) {
      expect(fairOdds(p, 1.01)).toBe(src.fairOdds(p, 1.01));
    }
    expect(fairOdds(0.99, 1.01)).toBe(1.01);
  });

  // … og uafgjort har sit eget. X ligger omkring 3-4 i odds, så et almindeligt
  // gulv binder aldrig dér; et gulv over X's fair pris viser, om kaldet fik det.
  it('outcomeOdds bruger oddsMin ens — også for uafgjort', async () => {
    const src = await import('../src/lib/superligaScoring.js');
    const args = { eloHome: 1500, eloAway: 1500, hfa: 0, drawBase: 0.305, drawDecay: 0.55 };
    expect(outcomeOdds(args).X).toBeLessThan(5);
    for (const oddsMin of [undefined, 5]) {
      expect(outcomeOdds({ ...args, oddsMin })).toEqual(src.outcomeOdds({ ...args, oddsMin }));
    }
    expect(outcomeOdds({ ...args, oddsMin: 5 })).toEqual({ 1: 5, X: 5, 2: 5 });
  });

  // Hvert udfald har sit eget fairOdds-kald. Gulvet på '2' skal derfor bevises
  // med en UDE-favorit for sig — ellers kunne det kald miste oddsMin, og
  // ude-favoritter i en sport med lavere gulv ville få fodboldens 1,1.
  it('outcomeOdds bruger oddsMin ens — også for UDE-favoritten', async () => {
    const src = await import('../src/lib/superligaScoring.js');
    const args = { eloHome: 1300, eloAway: 1900, hfa: 0, drawBase: 0.05, drawDecay: 0.2 };
    for (const oddsMin of [undefined, 1.01, 1.1, 1.2]) {
      expect(outcomeOdds({ ...args, oddsMin })).toEqual(src.outcomeOdds({ ...args, oddsMin }));
    }
    expect(outcomeOdds({ ...args, oddsMin: 1.01 })).toEqual({ 1: 33.78, X: 29.11, 2: 1.07 });
    expect(src.outcomeOdds({ ...args, oddsMin: 1.01 })['2']).toBe(1.07);
    expect(outcomeOdds(args)['2']).toBe(1.1);
  });
});

describe('puljeScore — perfekt-bonus-vagt (server, spejlet)', () => {
  it('flere picks end antal giver ikke gratis perfekt-bonus (TM-fund)', () => {
    const facit = ['A', 'B', 'C', 'D', 'E', 'F'];
    const r = puljeScore(['A', 'B', 'C', 'D', 'E', 'F', 'X', 'Y'], facit);
    expect(r).toEqual({ correct: 6, points: 6 * PULJE.PER_TEAM });
  });
});
