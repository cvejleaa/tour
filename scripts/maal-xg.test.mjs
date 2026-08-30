// Regressionstest for xG-målingens OPTÆLLING.
//
// Findes på grund af ét konkret fund: `vendte` talte en afgjort kamp som en
// "1-mod-2-vending", også når xG selv var PRÆCIS LIGE. Det er nøjagtig samme
// kategorifejl (uafgjort forvekslet med afgjort), som scriptet er skrevet for
// at afsløre i det gamle "50 %"-tal — bare flyttet over i det nye tal, man
// troede var det sikre. Uden denne test kan den glide tilbage uset: scriptet
// rammer to eksterne API'er, så ingen kørsel er reproducerbar nok til at
// fange en ændring i optællingen.
import { describe, it, expect } from 'vitest';
import {
  udfald, xgUdfald, xgUdfaldBaand, opdel, baandOvergange,
} from './maal-xg.mjs';

/** Én kamp: facit-udfald, xG-udfald, og de rå xG-tal. */
const kamp = (facit, xg, xgHome = 1, xgAway = 1) => ({ facit, xg, xgHome, xgAway });

describe('udfald og xgUdfald', () => {
  it('1 / X / 2 af to måltal', () => {
    expect(udfald(2, 0)).toBe('1');
    expect(udfald(0, 2)).toBe('2');
    expect(udfald(1, 1)).toBe('X');
  });

  it('xG med streng sammenligning kan LANDE på X ved præcis lighed', () => {
    // Vigtigt: den kan ikke FORUDSIGE uafgjort som en model, men to ens
    // decimaltal giver 'X'. Det er dét, der snød optællingen.
    expect(xgUdfald(1.4, 1.4)).toBe('X');
    expect(xgUdfald(1.5, 1.4)).toBe('1');
  });

  it('båndet kalder tætte kampe uafgjort', () => {
    expect(xgUdfaldBaand(1.4, 1.2, 0.5)).toBe('X');
    expect(xgUdfaldBaand(1.9, 1.2, 0.5)).toBe('1');
    expect(xgUdfaldBaand(1.2, 1.9, 0.5)).toBe('2');
  });
});

describe('opdel — vendinger må ikke smitte af på uafgjorte', () => {
  it('EN AFGJORT KAMP MED xG PRÆCIS LIGE ER IKKE EN VENDING', () => {
    // Test Managers fixture. Uden vagten gav den 2 af 3 = 67 %; det rigtige
    // svar er 1 af 3 = 33 %.
    const t = opdel([
      kamp('1', '2'), // ægte vending
      kamp('1', 'X'), // xG lige — peger ikke på det modsatte hold
      kamp('1', '1'), // enig
    ]);
    expect(t.afgjorte).toBe(3);
    expect(t.vendte).toBe(1);
    expect(t.xgLige).toBe(1);
  });

  it('uafgjorte facit-kampe holdes ude af vendings-tallet', () => {
    const t = opdel([kamp('X', '1'), kamp('X', '2'), kamp('2', '2')]);
    expect(t.uafgjorte).toBe(2);
    expect(t.uenigeUafgjort).toBe(2);
    expect(t.afgjorte).toBe(1);
    expect(t.vendte).toBe(0);
  });

  it('de tre bunker dækker ALLE uenigheder — intet falder mellem dem', () => {
    // Partitionen: uenig = uafgjort-facit + ægte vending + xG-lige-på-afgjort.
    const raekker = [
      kamp('X', '1'), kamp('1', '2'), kamp('1', 'X'),
      kamp('2', '2'), kamp('X', 'X'),
    ];
    const t = opdel(raekker);
    expect(t.uenigeUafgjort + t.vendte + t.xgLige).toBe(t.uenige);
  });

  it('et tomt felt giver nuller, ikke et kast', () => {
    const t = opdel([]);
    expect(t).toMatchObject({ n: 0, uenige: 0, afgjorte: 0, vendte: 0 });
  });
});

describe('baandOvergange — prisen er OVERGANGE, ikke en bunke', () => {
  it('en kamp der ALLEREDE var forkert, tæller ikke som en mistet rigtig', () => {
    // QC's fund. Første udgave talte enhver afgjort kamp, båndet kaldte
    // uafgjort, som "prisen" — også dem xG i forvejen havde peget forkert på.
    // Her: facit 1, xG pegede på 2 (allerede forkert), båndet gør den til X.
    // Det er et forkert gæt byttet ud med et andet, ikke en pris.
    const t = baandOvergange([{ facit: '1', xg: '2', xgHome: 1.0, xgAway: 1.1 }], 0.5);
    expect(t.mistetRigtig).toBe(0);
    expect(t.byttetForkert).toBe(1);
    expect(t.uenige).toBe(1);
  });

  it('en kamp der var RIGTIG og bliver forkert, er en ægte pris', () => {
    // facit 1, xG 1,4 mod 1,2 → uden bånd '1' (rigtig), med bånd 0,5 → 'X'.
    const t = baandOvergange([{ facit: '1', xg: '1', xgHome: 1.4, xgAway: 1.2 }], 0.5);
    expect(t.mistetRigtig).toBe(1);
    expect(t.vundetX).toBe(0);
  });

  it('en uafgjort kamp båndet nu rammer, er en ægte gevinst', () => {
    const t = baandOvergange([{ facit: 'X', xg: '1', xgHome: 1.4, xgAway: 1.2 }], 0.5);
    expect(t.vundetX).toBe(1);
    expect(t.mistetRigtig).toBe(0);
    expect(t.uenige).toBe(0);
  });

  it('bånd 0 ændrer intet — hverken gevinst eller pris', () => {
    const raekker = [
      { facit: '1', xg: '1', xgHome: 1.4, xgAway: 1.2 },
      { facit: 'X', xg: '1', xgHome: 1.4, xgAway: 1.2 },
    ];
    const t = baandOvergange(raekker, 0);
    expect(t).toMatchObject({ vundetX: 0, mistetRigtig: 0, byttetForkert: 0, uenige: 1 });
  });
});
