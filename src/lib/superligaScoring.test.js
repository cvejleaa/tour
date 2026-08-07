import { describe, it, expect } from 'vitest';
import {
  OUTCOME, DEFAULT_POINTS, round1, outcomeReward, roundComboBonus, COMBI, hitPoints, TRAEF_BONUS,
  isOutcome, outcomeFromScore, outcomePoints,
  eloExpectedHome, outcomeProbabilities, fairOdds, ODDS, outcomeOdds, ELO,
  chanceMaxStake, canUseChance, isValidStake, settleChance, CHANCE,
  updateElo, actualHomeFromOutcome,
  leagueTable, championshipTeams, puljeScore, PULJE,
} from './superligaScoring';
import { SUPERLIGA_TEAMS_2026 } from '../data/superligaTeams2026';

describe('1X2-udfald', () => {
  it('udleder udfald af mål', () => {
    expect(outcomeFromScore(2, 1)).toBe(OUTCOME.HOME);
    expect(outcomeFromScore(0, 0)).toBe(OUTCOME.DRAW);
    expect(outcomeFromScore(1, 3)).toBe(OUTCOME.AWAY);
  });
  it('returnerer null for ufuldstændigt resultat', () => {
    expect(outcomeFromScore(null, 1)).toBeNull();
    expect(outcomeFromScore(2, undefined)).toBeNull();
  });
  it('validerer udfald', () => {
    expect(isOutcome('1')).toBe(true);
    expect(isOutcome('X')).toBe(true);
    expect(isOutcome('2')).toBe(true);
    expect(isOutcome('3')).toBe(false);
    expect(isOutcome(null)).toBe(false);
  });
});

describe('outcomePoints (point = odds + træf-bonus)', () => {
  const odds = { '1': 3.12, X: 4.27, '2': 2.25 };

  // Bonussen er en JUSTERINGSSKRUE PÅ SPILLETS BALANCE, ikke en konstant man
  // retter i forbifarten: den var 1, og målingen viste, at den løftede
  // favorit-spilleren fra 30 % til 41 % af sæsonerne. Derfor låses værdien
  // her, så en ændring kræver, at man også retter denne test — og dermed ser,
  // at den koster en genberegning af ALLE point i produktion.
  it('er sat til 0 — se hitPoints for målingerne bag', () => {
    expect(TRAEF_BONUS).toBe(0);
  });

  // Med bonus 0 er point præcis kampens odds, afrundet til 1 decimal.
  it('ramt udfald giver kampens odds (1 decimal) plus træf-bonussen', () => {
    expect(outcomePoints('1', '1', odds)).toBe(3.1);
    expect(outcomePoints('X', 'X', odds)).toBe(4.3);
    expect(outcomePoints('2', '2', odds)).toBe(2.3);
  });

  // Combi'en må IKKE se bonussen — den ganger de rene odds. Ryger de to
  // sammen, ville et tillæg blive ganget med i stedet for lagt til. Det
  // gælder også nu, hvor bonussen er 0: sættes den igen, skal skellet holde.
  it('holder træf-bonussen ude af outcomeReward, som combien bruger', () => {
    expect(outcomeReward('1', odds)).toBe(3.1);
    expect(hitPoints('1', odds)).toBe(3.1);
    // Bonussen er 0, så de to er lige nu ENS. Skellet kan derfor ikke bevises
    // med den aktuelle værdi — men det kan bevises med en injiceret: sender vi
    // 1 ind, SKAL hitPoints lægge den til, mens outcomeReward står stille.
    // Uden dette kunne `+ bonus` fjernes helt uden at én test blev rød.
    expect(hitPoints('1', odds, 1)).toBe(4.1);
    expect(outcomeReward('1', odds)).toBe(3.1);
    expect(hitPoints('1', odds, 0.5)).toBe(3.6);
  });
  it('forkert tip = 0', () => {
    expect(outcomePoints('1', 'X', odds)).toBe(0);
    expect(outcomePoints('2', '1', odds)).toBe(0);
  });
  it('ugyldigt input = 0', () => {
    expect(outcomePoints('1', null, odds)).toBe(0);
    expect(outcomePoints(undefined, '1', odds)).toBe(0);
  });
  it('falder tilbage til DEFAULT_POINTS uden gyldige odds', () => {
    // Tallene skrives ud. Regnede vi dem af DEFAULT_POINTS, ville testen bestå,
    // selv om nogen ændrede standardværdierne — begge sider kom fra modulet.
    expect(outcomePoints('1', '1')).toBe(2);
    expect(outcomePoints('X', 'X', {})).toBe(4);
    expect(outcomePoints('2', '2', { '2': 'x' })).toBe(3);
  });
});

describe('outcomeReward + round1', () => {
  it('round1 afrunder til 1 decimal', () => {
    expect(round1(3.12)).toBe(3.1);
    expect(round1(4.27)).toBe(4.3);
    expect(round1(2.25)).toBe(2.3);
    expect(round1('x')).toBe(0);
  });
  it('outcomeReward = kampens odds (1 decimal), ellers fallback', () => {
    expect(outcomeReward('1', { '1': 5.99 })).toBe(6);
    expect(outcomeReward('X', null)).toBe(DEFAULT_POINTS.X);
    expect(outcomeReward('bad', { bad: 2 })).toBe(0);
  });
});

describe('roundComboBonus (combi-bonus)', () => {
  // Formlen: 2 × kvadratroden af de ramte odds ganget sammen, loft 25.
  const forvent = (odds) => round1(Math.min(2 * Math.sqrt(odds.reduce((a, b) => a * b, 1)), 25));

  it('ganger de ramte odds og tager kvadratroden', () => {
    // 1,5^6 = 11,4 → 2·√11,4 = 6,8. Under loftet, så formlen er synlig.
    expect(roundComboBonus([1.5, 1.5, 1.5, 1.5, 1.5, 1.5], 6)).toBe(6.8);
    expect(roundComboBonus([1.5, 1.5, 1.5, 1.5, 1.5, 1.5], 6)).toBe(forvent([1.5, 1.5, 1.5, 1.5, 1.5, 1.5]));
  });

  // HVER ramt kamp tæller. Den gamle regel gav nul ved to fejl, og det var
  // netop dét, der straffede modige tip: sandsynligheden for at feje en runde
  // falder hurtigere med mod, end oddsene stiger.
  it('betaler også ved to og tre fejl', () => {
    expect(roundComboBonus([2, 2, 2, 2], 6)).toBe(8);   // 2 fejl → 2·√16
    expect(roundComboBonus([2, 2, 2], 6)).toBe(5.7);    // 3 fejl → 2·√8
  });

  // Loftet binder først et godt stykke over en ren favorit-runde (2·√86 ≈ 18,5),
  // så en modig fejlfri runde er stadig mere værd end en forsigtig.
  it('lofter ved 25, men først over favorit-niveau', () => {
    expect(roundComboBonus([2.1, 2.1, 2.1, 2.1, 2.1, 2.1], 6)).toBe(18.5); // favoritter
    expect(roundComboBonus([4, 4, 4, 4, 4, 4], 6)).toBe(25);               // outsidere → loft
    expect(COMBI.LOFT).toBe(25);
  });

  it('kræver mindst to ramte — én kamp er ingen kupon', () => {
    expect(roundComboBonus([2.1], 6)).toBe(0);
    expect(roundComboBonus([], 6)).toBe(0);
  });

  // Et LIGE antal negative odds giver et positivt produkt og dermed bonus.
  // Kræver at en admin skriver negative odds — men reglen skal ikke hvile på,
  // at ingen gør det.
  it('giver 0 ved negative odds, ikke bonus for et positivt produkt', () => {
    expect(roundComboBonus([-2, -3], 2)).toBe(0);
    expect(roundComboBonus([-2, 3], 2)).toBe(0);
    expect(roundComboBonus([0, 3], 2)).toBe(0);
  });

  it('robust mod ugyldigt input', () => {
    expect(roundComboBonus(null, 6)).toBe(0);
    expect(roundComboBonus([2, 2], 1)).toBe(0);   // kupon på under to kampe
    expect(roundComboBonus([1.5, 1.5], 2)).toBe(3); // 2·√2,25
  });
});

describe('elo-lite sandsynligheder', () => {
  it('lige hold: hjemme favorit pga. hjemmebane, symmetrisk uafgjort', () => {
    const p = outcomeProbabilities({ eloHome: 1500, eloAway: 1500 });
    expect(p['1']).toBeGreaterThan(p['2']); // hjemmebane
    expect(p.X).toBeGreaterThan(0.2);
    const sum = p['1'] + p.X + p['2'];
    expect(sum).toBeCloseTo(1, 6);
  });
  it('summen af sandsynligheder er altid 1', () => {
    for (const [h, a] of [[1500, 1500], [1700, 1300], [1200, 1800], [1550, 1490]]) {
      const p = outcomeProbabilities({ eloHome: h, eloAway: a });
      expect(p['1'] + p.X + p['2']).toBeCloseTo(1, 6);
    }
  });
  it('stærkt hjemmehold har højest hjemme-sandsynlighed og lav uafgjort', () => {
    const even = outcomeProbabilities({ eloHome: 1500, eloAway: 1500 });
    const strong = outcomeProbabilities({ eloHome: 1900, eloAway: 1300 });
    expect(strong['1']).toBeGreaterThan(even['1']);
    expect(strong.X).toBeLessThan(even.X); // uafgjort falder med styrkeforskel
  });
  // Den gamle udgave af denne test krævede 24-28 % og hed "kalibreret mod
  // Superligaens ~26 %". Den var netop grunden til, at fejlen kunne stå i to
  // år: den målte modellen mod ét GENNEMSNIT. Modellen ramte snittet ved at
  // være for høj i de jævnbyrdige kampe og for lav i de skæve, og det kan et
  // gennemsnit ikke se. Nu låses den målte værdi i stedet.
  it('uafgjort ved lige hold står på den MÅLTE værdi, ikke på et snit', () => {
    const p = outcomeProbabilities({ eloHome: 1500, eloAway: 1500 });
    // Ved lige hold er skew 0, så pDraw = DRAW_BASE præcis.
    expect(p.X).toBeCloseTo(ELO.DRAW_BASE, 10);
    expect(ELO.DRAW_BASE).toBe(0.305);
  });

  // DRAW_DECAY er den parameter, der kun kan måles i skæve kampe — og netop
  // dér tog vi fejl én gang, fordi Superligaen ikke HAR skæve kampe. Låst her,
  // så den ikke kan ændres i forbifarten sammen med noget andet.
  it('uafgjort-henfaldet står på den efterprøvede værdi', () => {
    expect(ELO.DRAW_DECAY).toBe(0.55);
  });

  // Formen, ikke kun niveauet: modellen skal ramme den faktiske frekvens i
  // BEGGE ender. Tallene er målt på 6.143 spillede kampe, se
  // scripts/maal-uafgjort.mjs og docs/spilbalance.md.
  // BÅNDENE ER MED VILJE SMALLE. Første udgave tillod 13-20 % i det skæve ben,
  // og den gamle base (0,26) giver 13,7 % dér — altså bestod testen med præcis
  // den værdi, den skulle fange. Et bånd, der rummer både før og efter, måler
  // ingenting. Begge ben fejler nu med 0,26.
  it('rammer den faktiske uafgjort-frekvens i både jævnbyrdige og skæve kampe', () => {
    // Jævnbyrdigt (skew ≈ 0,03): målt 28-30 % over 254+360 kampe.
    // Model: 29,6 %. Med gammel base: 25,2 % → under gulvet.
    const jaevn = outcomeProbabilities({ eloHome: 1500, eloAway: 1490 }).X;
    expect(jaevn).toBeGreaterThan(0.28);
    expect(jaevn).toBeLessThan(0.31);
    // Skævt (skew ≈ 0,58, altså 230 Elo-point): målt 16,5 % over 285 kampe.
    // Model: 16,1 %. Med gammel base: 13,7 % → under gulvet.
    const skaevt = outcomeProbabilities({ eloHome: 1620, eloAway: 1390 }).X;
    expect(skaevt).toBeGreaterThan(0.15);
    expect(skaevt).toBeLessThan(0.18);
  });
  it('uafgjort topper ved REELT lige hold (måles uden hjemmebane)', () => {
    const even = outcomeProbabilities({ eloHome: 1500, eloAway: 1500 }).X;
    // Et udehold der lige akkurat udligner hjemmebanen må ikke give MERE uafgjort
    // end to lige stærke hold (fejlen vi rettede: draw-toppen lå forskudt).
    const awayEdge = outcomeProbabilities({ eloHome: 1500, eloAway: 1560 }).X;
    expect(even).toBeGreaterThanOrEqual(awayEdge);
  });
  it('eloExpectedHome > 0.5 ved lige hold (hjemmebane)', () => {
    expect(eloExpectedHome(1500, 1500)).toBeGreaterThan(0.5);
    expect(eloExpectedHome(1500, 1500, 0)).toBeCloseTo(0.5, 6);
  });
});

describe('fair odds', () => {
  it('inverterer sandsynlighed', () => {
    expect(fairOdds(0.5)).toBe(2);
    expect(fairOdds(0.25)).toBe(4);
  });
  it('har et gulv, men INTET loft', () => {
    expect(fairOdds(0.99)).toBe(ODDS.MIN);      // 1,01 → 1,1
    // Det her er hele ændringen: før blev alt over loftet skåret ned.
    expect(fairOdds(0.05)).toBe(20);            // 1/0,05 = 20, urørt
    expect(fairOdds(0.01)).toBe(100);           // 1/0,01 = 100, urørt
    expect(ODDS.MAX).toBeUndefined();
  });

  // Et umuligt udfald har ingen fair pris. Før faldt det tilbage på loftet;
  // nu findes der ikke et, så tallet skal være valgt bevidst — ikke Infinity,
  // som ville forplante sig ind i pointsummer og combi-produkter.
  it('giver et endeligt tal for et ugyldigt udfald', () => {
    expect(fairOdds(0)).toBe(ODDS.UGYLDIG);
    expect(fairOdds(-1)).toBe(ODDS.UGYLDIG);
    expect(fairOdds('x')).toBe(ODDS.UGYLDIG);
    expect(Number.isFinite(ODDS.UGYLDIG)).toBe(true);
  });

  // Grunden til at loftet forsvandt: to vidt forskellige gæt kunne stå til
  // nøjagtig samme pris, så et informeret modigt valg var umuligt. Det kan
  // ikke ske uden et loft — men testen skal stå, hvis nogen genindfører et.
  it('to udfald i samme kamp kan aldrig betale nøjagtig det samme', () => {
    let ens = 0;
    for (const hjemme of SUPERLIGA_TEAMS_2026) {
      for (const ude of SUPERLIGA_TEAMS_2026) {
        if (hjemme === ude) continue;
        const o = outcomeOdds({ eloHome: hjemme.elo, eloAway: ude.elo });
        if (o['1'] === o.X || o.X === o['2'] || o['1'] === o['2']) ens += 1;
      }
    }
    expect(ens).toBe(0);
  });

  // Chancen er nu ubegrænset opad, og det er et bevidst valg — ikke et
  // overset hjørne. Et loft klipper kun gevinsten, aldrig indsatsen, så en
  // Chance på høje odds fik negativ forventning: målt over 3.000 sæsoner tabte
  // den modige 34 point om året ved loft 6, og den, der slet ikke brugte
  // Chancen, vandt oftere end ham.
  it('Chancen betaler den fulde odds — ingen klipning af gevinsten', () => {
    const stor = settleChance({ correct: true, stake: CHANCE.MAX_ABS, fairOdds: 24.39 });
    expect(stor.profit).toBe(Math.round(CHANCE.MAX_ABS * 23.39));
    // Indsatsen er stadig begrænset — det er dér risikoen styres.
    expect(CHANCE.MAX_ABS).toBe(8);
  });
  it('favorit giver lav odds, outsider høj', () => {
    const o = outcomeOdds({ eloHome: 1900, eloAway: 1300 });
    expect(o['1']).toBeLessThan(o['2']); // favorit-hjemme billig, outsider-ude dyr
  });
});

describe('Chancen — indsatsgrænser', () => {
  it('max = min(absolut loft 8, 15% af saldo)', () => {
    expect(chanceMaxStake(10)).toBe(1);      // 15% binder: floor(0.15*10) = 1
    expect(chanceMaxStake(40)).toBe(6);      // 15% binder: floor(0.15*40) = 6
    expect(chanceMaxStake(100)).toBe(8);     // absolut loft (8) binder før 15%
    expect(chanceMaxStake(0)).toBe(0);
    expect(chanceMaxStake(6)).toBe(0);       // floor(0.9) = 0
  });
  it('cap er strengt under 50% ⇒ kan aldrig gå i minus', () => {
    for (const bank of [7, 25, 50, 200]) {
      expect(chanceMaxStake(bank)).toBeLessThan(bank * 0.5);
    }
  });
  it('canUseChance kræver råd til mindste indsats (mindst 7 point)', () => {
    expect(canUseChance(0)).toBe(false);
    expect(canUseChance(6)).toBe(false);     // max 0
    expect(canUseChance(7)).toBe(true);      // 15% = 1
  });
  it('validerer indsats mod saldo', () => {
    expect(isValidStake(1, 7)).toBe(true);
    expect(isValidStake(8, 100)).toBe(true);    // = absolut loft
    expect(isValidStake(9, 100)).toBe(false);   // over max (8)
    expect(isValidStake(0, 100)).toBe(false);   // under MIN
    expect(isValidStake(2.5, 100)).toBe(false); // ikke heltal
  });
});

describe('Chancen — afregning', () => {
  it('gevinst = indsats × (odds − 1)', () => {
    expect(settleChance({ correct: true, stake: 5, fairOdds: 3 })).toEqual({ delta: 10, profit: 10 });
    expect(settleChance({ correct: true, stake: 4, fairOdds: 2 })).toEqual({ delta: 4, profit: 4 });
  });
  it('tab koster kun indsatsen (ingen bøde)', () => {
    expect(settleChance({ correct: false, stake: 5, fairOdds: 3 })).toEqual({ delta: -5, profit: 0 });
  });
  it('ingen indsats = ingen effekt', () => {
    expect(settleChance({ correct: true, stake: 0, fairOdds: 3 })).toEqual({ delta: 0, profit: 0 });
  });
  it('taber aldrig mere end indsatsen ⇒ saldo kan ikke gå i minus', () => {
    const bank = 10;
    const stake = chanceMaxStake(bank); // 4
    const { delta } = settleChance({ correct: false, stake, fairOdds: 6 });
    expect(bank + delta).toBeGreaterThanOrEqual(0);
  });
});

describe('pulje-tip: slutstilling + score', () => {
  // 3 hold, hver spiller hinanden én gang. A slår B og C; B slår C.
  const matches = [
    { home: 'A', away: 'B', homeGoals: 2, awayGoals: 0 }, // A 3
    { home: 'A', away: 'C', homeGoals: 1, awayGoals: 0 }, // A 3
    { home: 'B', away: 'C', homeGoals: 3, awayGoals: 1 }, // B 3
  ];
  it('leagueTable rangerer efter point, målforskel, mål', () => {
    const t = leagueTable(matches);
    expect(t.map((r) => r.name)).toEqual(['A', 'B', 'C']);
    expect(t[0]).toMatchObject({ name: 'A', points: 6, gd: 3 });
    expect(t[1]).toMatchObject({ name: 'B', points: 3, gd: 0 });
    expect(t[2]).toMatchObject({ name: 'C', points: 0, gd: -3 });
  });
  it('championshipTeams tager de øverste N', () => {
    expect(championshipTeams(matches, 2)).toEqual(['A', 'B']);
  });
  it('ignorerer kampe uden gyldige mål', () => {
    const t = leagueTable([...matches, { home: 'A', away: 'B', homeGoals: null, awayGoals: 2 }]);
    expect(t[0].played).toBe(2); // den ugyldige kamp tælles ikke
  });
  it('puljeScore: point pr. korrekt hold + perfekt-bonus', () => {
    const top6 = ['A', 'B', 'C', 'D', 'E', 'F'];
    expect(puljeScore(['A', 'B', 'C', 'D', 'E', 'F'], top6))
      .toEqual({ correct: 6, points: 6 * PULJE.PER_TEAM + PULJE.PERFECT_BONUS });
    expect(puljeScore(['A', 'B', 'C', 'D', 'E', 'X'], top6))
      .toEqual({ correct: 5, points: 5 * PULJE.PER_TEAM });
    expect(puljeScore(['X', 'Y', 'Z', 'Q', 'R', 'S'], top6))
      .toEqual({ correct: 0, points: 0 });
  });
});

describe('Elo-vedligeholdelse', () => {
  it('vinder stiger, taber falder, nulsum', () => {
    const { home, away } = updateElo(1500, 1500, 1); // hjemmesejr
    expect(home).toBeGreaterThan(1500);
    expect(away).toBeLessThan(1500);
    expect((home - 1500) + (away - 1500)).toBeCloseTo(0, 6);
  });
  it('uafgjort flytter mod forventningen', () => {
    const { home, away } = updateElo(1700, 1300, 0.5); // favorit spiller uafgjort
    expect(home).toBeLessThan(1700); // favorit taber rating på uafgjort
    expect(away).toBeGreaterThan(1300);
  });
  it('actualHome oversætter udfald', () => {
    expect(actualHomeFromOutcome('1')).toBe(1);
    expect(actualHomeFromOutcome('X')).toBe(0.5);
    expect(actualHomeFromOutcome('2')).toBe(0);
  });
});
