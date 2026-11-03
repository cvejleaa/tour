// ---------------------------------------------------------------------------
// Grupperne (src/lib/grupper.js): regnemotoren syntetisk, og evnen, kampens
// gruppe, oversigten og advarslerne på den FORMATTRO fixture
// (src/test/hvm2027Grupper.js). IHF-oraklet står i grupper.orakel.test.js.
//
// Hver test er skrevet, så den bliver rød af den fejl, den hedder efter:
// rækkefølgerne er valgt, så et oversprunget kriterie giver en ANDEN orden,
// og `hold`-rækkefølgen er valgt, så et tilbagefald til programrækkefølgen
// ikke tilfældigt giver facit.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import {
  gruppeStilling, rangerGruppe, IHF_REGEL, grupperFejl, harGrupper, kampGruppe, grupperOversigt, grupperAdvarsel,
} from './grupper';
import { harFaseKalender } from './faser';
import { leagueTable } from './superligaScoring';
import { GAMES } from '../../scripts/games.mjs';
import program from '../../scripts/haandbold-vm2027-program.json';
import {
  GRUPPER, HVM27G, INDLEDENDE, medFacit, eloFacit, hovedrundeKampe, GRUPPE_A_KNAEK, A_KNAEK_ORDEN,
} from '../test/hvm2027Grupper';

const P = { sejr: 2, uafgjort: 1 };
const k = (home, away, homeGoals, awayGoals) => ({ home, away, homeGoals, awayGoals });
const orden = (r) => r.map((x) => x.teamName);
const raekke = (r, navn) => r.find((x) => x.teamName === navn);

describe('gruppeStilling: point', () => {
  it('en sejr giver 2 point (rød ved fodboldens 3), et nederlag 0', () => {
    const r = gruppeStilling(['A', 'B'], [k('A', 'B', 30, 25)], P);
    expect(raekke(r, 'A')).toMatchObject({ points: 2, won: 1, draw: 0, lost: 0, played: 1, gf: 30, ga: 25 });
    expect(raekke(r, 'B')).toMatchObject({ points: 0, won: 0, draw: 0, lost: 1, played: 1, gf: 25, ga: 30 });
  });
  it('pointene kommer fra `point`, ikke fra en literal', () => {
    expect(raekke(gruppeStilling(['A', 'B'], [k('A', 'B', 30, 25)], { sejr: 3, uafgjort: 1 }), 'A').points).toBe(3);
  });
  it('uafgjort giver 1 point til hver', () => {
    const r = gruppeStilling(['A', 'B'], [k('A', 'B', 27, 27)], P);
    expect(r.map((x) => [x.teamName, x.points, x.draw])).toEqual([['A', 1, 1], ['B', 1, 1]]);
  });
});

describe('gruppeStilling: hvilke kampe tæller', () => {
  it('kampe uden facit tælles ikke (null, tom tekst, manglende felt)', () => {
    const r = gruppeStilling(['A', 'B', 'C'], [
      k('A', 'B', 30, 25), k('A', 'C', null, null), k('B', 'C', '', ''), { home: 'C', away: 'A' }, k('B', 'C', 20, undefined),
    ], P);
    expect(raekke(r, 'C')).toMatchObject({ played: 0, gf: 0, ga: 0, points: 0 });
    expect(raekke(r, 'A').played).toBe(1);
    expect(raekke(r, 'B').played).toBe(1);
  });
  it('kun kampe, hvor BEGGE hold er i gruppen', () => {
    const r = gruppeStilling(['A', 'B'], [k('A', 'B', 30, 25), k('A', 'X', 10, 40), k('Y', 'B', 10, 40)], P);
    expect(raekke(r, 'A')).toMatchObject({ played: 1, gf: 30, ga: 25 });
    expect(raekke(r, 'B')).toMatchObject({ played: 1, gf: 25, ga: 30 });
    expect(orden(r)).toEqual(['A', 'B']);
  });
  it('goalOf-reglen er leagueTables: samme K og mål på de samme kampe', () => {
    const kampe = [k('A', 'B', '30', '25'), k('B', 'C', 0, '0'), k('C', 'A', '', 3), k('A', 'C', null, 1), k('C', 'B', '28', 28)];
    const vores = gruppeStilling(['A', 'B', 'C'], kampe, P);
    const deres = leagueTable(kampe);
    for (const navn of ['A', 'B', 'C']) {
      const d = deres.find((x) => x.name === navn);
      expect(raekke(vores, navn)).toMatchObject({ played: d.played, gf: d.gf, ga: d.ga });
    }
    // Og tallene selv (ellers kunne begge tælle forkert ens):
    expect(raekke(vores, 'B')).toMatchObject({ played: 3, gf: 53, ga: 58 });
  });
});

describe('gruppeStilling: placeringstal', () => {
  it('før gruppens første afgjorte kamp: rank null for alle, i programrækkefølge', () => {
    const r = gruppeStilling(['C', 'A', 'B'], [k('A', 'B', null, null)], P);
    expect(r.map((x) => [x.teamName, x.rank, x.delt])).toEqual([['C', null, false], ['A', null, false], ['B', null, false]]);
  });
  it('efter første kamp har alle et tal', () => {
    const r = gruppeStilling(['C', 'A', 'B'], [k('A', 'B', 30, 25)], P);
    expect(r.map((x) => [x.teamName, x.rank])).toEqual([['A', 1], ['C', 2], ['B', 3]]);
  });
});

describe('gruppeStilling: IHF\'s tiebreak', () => {
  // Cirkulær trevejs-lighed: A>B, B>C, C>A, og alle slår D. Indbyrdes point
  // er lige (2-2-2). D-kampene er valgt, så målforskellen i ALLE kampe giver
  // den OMVENDTE orden (C, B, A) — rød, hvis (3) springes over.
  it('cirkulær trevejs-lighed afgøres på indbyrdes målforskel', () => {
    const kampe = [
      k('A', 'B', 30, 25), k('B', 'C', 28, 26), k('C', 'A', 28, 27), // indbyrdes: A +4, C -1, B -3
      k('A', 'D', 26, 25), k('B', 'D', 35, 25), k('C', 'D', 40, 20),
    ];
    const r = gruppeStilling(['D', 'C', 'B', 'A'], kampe, P);
    expect(orden(r)).toEqual(['A', 'C', 'B', 'D']);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
    expect(r.some((x) => x.delt)).toBe(false);
  });
  // Samme form, men alle indbyrdes sejre er med ét mål: indbyrdes
  // målforskel 0-0-0. Indbyrdes mål afgør (A 57, B 54, C 52); målforskel i
  // alle kampe ville give C, B, A.
  it('cirkulær trevejs-lighed med lige indbyrdes målforskel afgøres på indbyrdes mål', () => {
    const kampe = [
      k('A', 'B', 30, 29), k('B', 'C', 25, 24), k('C', 'A', 28, 27),
      k('A', 'D', 26, 25), k('B', 'D', 35, 25), k('C', 'D', 40, 20),
    ];
    expect(orden(gruppeStilling(['D', 'C', 'B', 'A'], kampe, P))).toEqual(['A', 'B', 'C', 'D']);
  });
  // (2) indbyrdes point før (3) indbyrdes målforskel: A har flest indbyrdes
  // point (slog B og C med 1), B den bedste indbyrdes målforskel (slog C med
  // 10). A, B og C står lige på 4 point via D og E. Rød, hvis (2) springes over
  // — oraklet kan ikke fange det (grupper.orakel.test.js).
  it('indbyrdes point går forud for indbyrdes målforskel', () => {
    const kampe = [
      k('A', 'B', 25, 24), k('A', 'C', 25, 24), k('B', 'C', 30, 20),
      k('D', 'A', 30, 20), k('E', 'A', 30, 20), k('B', 'D', 30, 20), k('E', 'B', 30, 20),
      k('C', 'D', 30, 20), k('C', 'E', 30, 29), k('E', 'D', 30, 20),
    ];
    const r = gruppeStilling(['E', 'D', 'C', 'B', 'A'], kampe, P);
    expect(r.map((x) => [x.teamName, x.points])).toEqual([['E', 6], ['A', 4], ['B', 4], ['C', 4], ['D', 2]]);
    expect(orden(rangerGruppe(['E', 'D', 'C', 'B', 'A'], kampe, P, { ...IHF_REGEL, indbyrdes: ['maalforskel', 'maal'] })))
      .toEqual(['E', 'B', 'A', 'C', 'D']); // kontrollen: uden (2) bliver ordenen en anden
  });
  // (6) flest scorede mål i alle kampe, efter (5): A og B spiller 25-25 og
  // slår begge C med 5 — lige på point, indbyrdes og målforskel. A har scoret
  // flere. B står først i `hold`, så et tilbagefald til programrækkefølgen
  // giver den forkerte orden.
  it('(6) flest scorede mål i alle kampe afgør, når (1)-(5) står lige', () => {
    const r = gruppeStilling(['B', 'A', 'C'], [k('A', 'B', 25, 25), k('A', 'C', 30, 25), k('B', 'C', 26, 21)], P);
    expect(r.map((x) => [x.teamName, x.rank, x.delt])).toEqual([['A', 1, false], ['B', 2, false], ['C', 3, false]]);
  });
  it('fuld lighed: samme placering, delt:true, og programrækkefølgen inden for den', () => {
    const r = gruppeStilling(['B', 'A', 'C'], [k('A', 'B', 25, 25), k('A', 'C', 30, 25), k('B', 'C', 30, 25)], P);
    expect(r.map((x) => [x.teamName, x.rank, x.delt])).toEqual([['B', 1, true], ['A', 1, true], ['C', 3, false]]);
  });
  // GENANVENDELSE: ingen (ordlyden; se headeren i grupper.js). A skilles fra
  // af indbyrdes målforskel; B og C står helt lige i trekanten (−1, 55 mål),
  // men B slog C. Uden genanvendelse afgør målforskellen i alle kampe: C.
  it('uden genanvendelse: resten afgøres af alle kampe, ikke af deres egen indbyrdes kamp', () => {
    const kampe = [
      k('A', 'B', 30, 27), k('B', 'C', 28, 26), k('C', 'A', 29, 28),
      k('A', 'D', 30, 25), k('B', 'D', 26, 25), k('C', 'D', 35, 25),
    ];
    const hold = ['D', 'B', 'C', 'A'];
    expect(orden(gruppeStilling(hold, kampe, P))).toEqual(['A', 'C', 'B', 'D']);
    expect(IHF_REGEL.genanvend).toBe(false);
    // Kontrollen: med genanvendelse vinder B på den indbyrdes kamp.
    expect(orden(rangerGruppe(hold, kampe, P, { ...IHF_REGEL, genanvend: true }))).toEqual(['A', 'B', 'C', 'D']);
  });
});

// ---------------------------------------------------------------------------
const SL = GAMES.find((g) => g.id === 'superliga2627');
const PL = GAMES.find((g) => g.id === 'pl2627-efteraar');
const medGrupper = (fn) => {
  const g = structuredClone(GRUPPER);
  fn(g);
  return { ...HVM27G, grupper: g };
};
const kamp = (round, home, away) => ({ id: `t-${round}-${home}-${away}`, round, home, away, kickoff: 1 });

describe('grupperFejl og harGrupper (evnen)', () => {
  it('den formattro fixture er gyldig', () => {
    expect(grupperFejl(GRUPPER, HVM27G)).toEqual([]);
    expect(harGrupper(HVM27G)).toBe(true);
    expect(GRUPPER.faser[0].grupper.find((g) => g.navn === 'A').hold).toEqual(['Serbien', 'Uruguay', 'Tyskland', 'Tunesien']);
  });
  it('SL, PL og hvm2027 uden grupper har ikke evnen', () => {
    expect(harGrupper(SL)).toBe(false);
    expect(harGrupper(PL)).toBe(false);
    expect(harGrupper({ ...HVM27G, grupper: undefined })).toBe(false);
    expect(harGrupper(null)).toBe(false);
  });
  const UGYLDIGE = [
    ['fasen hedder «Hovedrunden» (bestemt form, ikke kalenderens navn)', (g) => { g.faser[1].fase = 'Hovedrunden'; }, /«Hovedrunden» findes ikke/],
    ['et hold i to grupper', (g) => { g.faser[0].grupper[1].hold[0] = 'Serbien'; }, /«Serbien» står i både gruppe A og B/],
    ['et hold uden for spillets holdliste', (g) => { g.faser[0].grupper[0].hold[0] = 'Atlantis'; }, /«Atlantis» står ikke i spillets holdliste/],
    ['en knockout-fase', (g) => { g.faser[1].fase = 'Kvartfinaler'; }, /«Kvartfinaler» er knockout/],
    ['fra nævner en gruppe, der ikke findes', (g) => { g.faser[1].grupper[0].fra = ['A', 'Z']; }, /fra nævner «Z»/],
    ['point i fodboldform uden sejr', (g) => { g.point = { sejr: 0, uafgjort: 1 }; }, /point skal være/],
    ['videre er ikke et tal', (g) => { g.faser[0].videre = '3'; }, /videre skal være et heltal/],
    // TM: hver af disse regler kunne slås fra (if (false)) med suiten grøn.
    ['to hovedrundegrupper henter fra samme indledende gruppe', (g) => { g.faser[1].grupper[1].fra = ['A', 'D']; }, /gruppe A står i fra for både I og II/],
    ['to grupper med samme navn', (g) => { g.faser[1].grupper[1].navn = 'I'; }, /gruppe I står to gange/],
    ['hovedrunden før den indledende i kalenderen', (g) => { g.faser.reverse(); }, /kommer ikke efter forrige gruppefase/],
    ['en tredje gruppefase', (g) => { g.faser.push({ fase: 'Hovedrunde', videre: 1, grupper: [{ navn: 'V', fra: ['I'] }] }); }, /højst to gruppefaser/],
  ];
  for (const [navn, fn, besked] of UGYLDIGE) {
    it(`ugyldig: ${navn} — evnen falder, kalenderen står`, () => {
      const game = medGrupper(fn);
      expect(grupperFejl(game.grupper, game).join('\n')).toMatch(besked);
      expect(harGrupper(game)).toBe(false);
      expect(harFaseKalender(game)).toBe(true); // isolationsbeviset (D1)
      expect(kampGruppe(game, INDLEDENDE[0])).toBeNull();
      expect(grupperOversigt(game, INDLEDENDE)).toEqual([]);
    });
  }
});

describe('grupperFejl: spillet selv', () => {
  // TM: `if (!teams.size)` og `if (!harFaseKalender)` kunne slås fra uden en rød test.
  it('uden holdliste siges det højt', () => {
    expect(grupperFejl(GRUPPER, { ...HVM27G, teams: [] }).join('\n')).toMatch(/ingen holdliste/);
  });
  it('uden gyldig fasekalender siges det højt, og evnen falder', () => {
    const uden = { ...HVM27G, faser: undefined };
    expect(grupperFejl(GRUPPER, uden).join('\n')).toMatch(/ingen gyldig fasekalender/);
    expect(harGrupper(uden)).toBe(false);
  });
});

describe('kampGruppe', () => {
  it('hver af de 48 kampe i programmet = programmets gruppe', () => {
    expect(INDLEDENDE).toHaveLength(48);
    const fundet = program.fixtures.map((f) => [f.id, kampGruppe(HVM27G, f)]);
    expect(fundet).toEqual(program.fixtures.map((f) => [f.id, f.gruppe]));
    expect(new Set(fundet.map(([, g]) => g)).size).toBe(8);
  });
  it('hovedrunden: gruppen, hvis fra rummer begge holds indledende gruppe', () => {
    expect(kampGruppe(HVM27G, kamp(8, 'Danmark', 'Island'))).toBe('IV');
    expect(kampGruppe(HVM27G, kamp(9, 'Danmark', 'Norge'))).toBeNull();
    expect(kampGruppe(HVM27G, kamp(9, 'Kroatien', 'Frankrig'))).toBe('II');
    expect(kampGruppe(HVM27G, kamp(8, 'Serbien', 'Egypten'))).toBe('I');
  });
  it('null i knockout, for SL og for to hold fra hver sin indledende gruppe', () => {
    expect(kampGruppe(HVM27G, kamp(14, 'Danmark', 'Island'))).toBeNull();
    expect(kampGruppe(SL, { round: 1, home: 'FC København', away: 'Brøndby IF' })).toBeNull();
    expect(kampGruppe(HVM27G, kamp(1, 'Serbien', 'Italien'))).toBeNull();
  });
});

describe('grupperOversigt', () => {
  const INDL_FACIT = medFacit(INDLEDENDE, GRUPPE_A_KNAEK);
  const A_TOP3 = A_KNAEK_ORDEN.slice(0, 3);

  it('før start: 8 indledende grupper uden placeringstal, 4 hovedrundegrupper venter', () => {
    const o = grupperOversigt(HVM27G, INDLEDENDE);
    expect(o.map((f) => [f.fase, f.videre, f.start])).toEqual([['Indledende runde', 3, '2027-01-13'], ['Hovedrunde', 2, '2027-01-20']]);
    expect(o[0].grupper.map((g) => g.navn)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    expect(o[0].grupper[0].raekker.map((r) => [r.teamName, r.rank])).toEqual(
      [['Serbien', null], ['Uruguay', null], ['Tyskland', null], ['Tunesien', null]],
    );
    expect(o[1].grupper.map((g) => [g.navn, g.status, g.hold, g.raekker, g.videreHold, g.fra])).toEqual([
      ['I', 'venter', [], null, null, ['A', 'B']], ['II', 'venter', [], null, null, ['C', 'D']],
      ['III', 'venter', [], null, null, ['E', 'F']], ['IV', 'venter', [], null, null, ['G', 'H']],
    ]);
  });

  it('den indledende stilling i gruppe A (indbyrdes afgør to gange)', () => {
    const a = grupperOversigt(HVM27G, INDL_FACIT)[0].grupper[0];
    expect(a.raekker.map((r) => [r.teamName, r.rank, r.points])).toEqual(
      [['Tyskland', 1, 4], ['Serbien', 2, 4], ['Tunesien', 3, 2], ['Uruguay', 4, 2]],
    );
    expect(a.videreHold).toBeNull(); // hovedrunden er ikke lagt ind
  });

  describe('hovedrunden lagt ind (alle 36 kampe, ingen facit endnu)', () => {
    const kampe = [...INDL_FACIT, ...hovedrundeKampe({ A: A_TOP3 })];
    const o = grupperOversigt(HVM27G, kampe);
    const gI = o[1].grupper[0];
    it('alle fire klar med 6 hold, og K = 2 for alle før første hovedrundekamp', () => {
      expect(o[1].grupper.map((g) => [g.navn, g.status, g.hold.length])).toEqual(
        [['I', 'klar', 6], ['II', 'klar', 6], ['III', 'klar', 6], ['IV', 'klar', 6]],
      );
      for (const g of o[1].grupper) expect(g.raekker.map((r) => r.played)).toEqual([2, 2, 2, 2, 2, 2]);
    });
    it('medførte resultater: kun mod de medkvalificerede', () => {
      // Tyskland slog begge medkvalificerede og tabte til nr. 4: P = 4 og K = 2
      // (ikke 4+0 med K = 3 og Uruguay-målene).
      expect(raekke(gI.raekker, 'Tyskland')).toMatchObject({ played: 2, points: 4, gf: 62, ga: 54 });
      // Tunesien tabte til begge og slog nr. 4: P = 0, ikke 2.
      expect(raekke(gI.raekker, 'Tunesien')).toMatchObject({ played: 2, points: 0, won: 0 });
    });
    it('nr. 4 (Uruguay) er ikke med, og holdene står i programrækkefølge', () => {
      expect(gI.hold).toEqual(['Serbien', 'Tyskland', 'Tunesien', 'Italien', 'Saudi-Arabien', 'Egypten']);
      expect(gI.hold).not.toContain('Uruguay');
    });
    it('videreHold i den indledende = holdene med kamp i hovedrunden, i stillingens orden', () => {
      expect(o[0].grupper[0].videreHold).toEqual(A_TOP3);
      expect(gI.videreHold).toBeNull(); // kvartfinalerne er ikke lagt ind
    });
    it('ingen advarsler, når alt passer', () => {
      expect(grupperAdvarsel(HVM27G, kampe)).toEqual([]);
    });
  });

  it('kun 4 af gruppe I\'s 6 hold lagt ind → venter (og A\'s videreHold er ukendt)', () => {
    const dag8 = hovedrundeKampe({ A: A_TOP3 }, { runder: [8] }).filter((m) => m.id.startsWith('r8-I-')).slice(0, 2);
    const o = grupperOversigt(HVM27G, [...INDL_FACIT, ...dag8]);
    expect(o[1].grupper[0]).toMatchObject({ status: 'venter', raekker: null, videreHold: null });
    expect(o[1].grupper[0].hold).toHaveLength(4);
    expect(o[0].grupper[0].videreHold).toBeNull();
  });

  it('alle tre A-hold har kamp, men kun to B-hold → I venter, og A\'s videreHold venter med (Q1: først når gruppen er klar)', () => {
    const alle = hovedrundeKampe({ A: A_TOP3 });
    const valgt = alle.filter((m) => ['r8-I-x1y3', 'r8-I-y1x2', 'r10-I-x3y1'].includes(m.id));
    expect(valgt).toHaveLength(3);
    const o = grupperOversigt(HVM27G, [...INDL_FACIT, ...valgt]);
    expect(o[1].grupper[0]).toMatchObject({ status: 'venter', raekker: null });
    expect(o[1].grupper[0].hold).toEqual(['Serbien', 'Tyskland', 'Tunesien', 'Saudi-Arabien', 'Egypten']);
    expect(o[0].grupper[0].videreHold).toBeNull();
  });

  it('dag 8 lagt ind → I og III klar, II og IV venter', () => {
    const o = grupperOversigt(HVM27G, [...INDL_FACIT, ...hovedrundeKampe({ A: A_TOP3 }, { runder: [8] })]);
    expect(o[1].grupper.map((g) => [g.navn, g.status])).toEqual([['I', 'klar'], ['II', 'venter'], ['III', 'klar'], ['IV', 'venter']]);
    expect(o[0].grupper.map((g) => g.videreHold !== null)).toEqual([true, true, false, false, true, true, false, false]);
  });
});

describe('Q1: IHF afgør, hvem der gik videre — og advarslen peger', () => {
  const INDL_FACIT = medFacit(INDLEDENDE, GRUPPE_A_KNAEK);
  it('indledende → hovedrunde: rang 3 er Tunesien, men Uruguay er lagt ind', () => {
    const kampe = [...INDL_FACIT, ...hovedrundeKampe({ A: ['Tyskland', 'Serbien', 'Uruguay'] })];
    const o = grupperOversigt(HVM27G, kampe);
    const a = o[0].grupper[0];
    expect(a.raekker[2]).toMatchObject({ teamName: 'Tunesien', rank: 3 });
    expect(a.videreHold).toEqual(['Tyskland', 'Serbien', 'Uruguay']); // følger det indlagte, ikke vores rang
    expect(o[1].grupper[0].hold).toContain('Uruguay');
    expect(o[1].grupper[0].hold).not.toContain('Tunesien');
    expect(grupperAdvarsel(HVM27G, kampe)).toEqual([
      'Gruppe A: stillingen siger Tunesien som nr. 3, men Uruguay er lagt ind i hovedrunden. Tjek facit eller hovedrundens kampe.',
    ]);
  });
  it('hovedrunde → kvartfinaler: stillingen siger Egypten som nr. 2, men Serbien er lagt ind', () => {
    const hoved = hovedrundeKampe({ A: A_KNAEK_ORDEN.slice(0, 3) }).map(eloFacit);
    const kvart = [kamp(14, 'Tyskland', 'Danmark'), kamp(15, 'Serbien', 'Kroatien')];
    const kampe = [...INDL_FACIT, ...hoved, ...kvart];
    const gI = grupperOversigt(HVM27G, kampe)[1].grupper[0];
    expect(gI.raekker.slice(0, 3).map((r) => [r.teamName, r.rank])).toEqual([['Tyskland', 1], ['Egypten', 2], ['Serbien', 3]]);
    expect(gI.videreHold).toEqual(['Tyskland', 'Serbien']);
    expect(grupperAdvarsel(HVM27G, kampe)).toEqual([
      'Gruppe I: stillingen siger Egypten som nr. 2, men Serbien er lagt ind i kvartfinalerne. Tjek facit eller kvartfinalernes kampe.',
    ]);
  });
  it('ingen Q1-advarsel, før gruppens kampe alle er afgjort (en facit, der mangler, er ikke en uenighed)', () => {
    // Uden Serbien–Uruguay står Tunesien stadig som nr. 3 (indbyrdes over
    // Uruguay), så uden vagten ville advarslen komme.
    const uden = INDL_FACIT.map((m) => (m.id === 'r1-srb-uru' ? { ...m, homeGoals: null, awayGoals: null, result: null } : m));
    expect(grupperOversigt(HVM27G, uden)[0].grupper[0].raekker[2].teamName).toBe('Tunesien');
    const kampe = [...uden, ...hovedrundeKampe({ A: ['Tyskland', 'Serbien', 'Uruguay'] })];
    expect(grupperAdvarsel(HVM27G, kampe)).toEqual([]);
  });
});

describe('grupperAdvarsel: flere hold end der går videre, og delt plads over stregen (TM)', () => {
  const INDL_FACIT = medFacit(INDLEDENDE, GRUPPE_A_KNAEK);
  // Før TM var hele «flere hold end der går videre»-grenen uden test: den kunne slettes, og
  // tærsklen flyttes til > videre + 1, med suiten grøn.
  it('fire A-hold lagt ind i hovedrunden, men kun tre går videre → advarslen, ved navn', () => {
    const ekstra = kamp(8, 'Uruguay', 'Italien'); // Uruguay er nr. 4 i A; Italien er fra B
    const kampe = [...INDL_FACIT, ...hovedrundeKampe({ A: A_KNAEK_ORDEN.slice(0, 3) }), ekstra];
    // Fire hold er ikke «de hold, der gik videre»: videreHold er ukendt (null), ikke fire ✓.
    expect(grupperOversigt(HVM27G, kampe)[0].grupper[0].videreHold).toBeNull();
    expect(grupperAdvarsel(HVM27G, kampe)).toContain(
      'Gruppe A: 4 hold er lagt ind i hovedrunden (Tyskland, Serbien, Tunesien, Uruguay), men kun 3 går videre. Tjek hovedrundens kampe.',
    );
  });
  // «Klar» kræver netop `videre` hold: fire A-hold i en ellers klar hovedrundegruppe (4 + 2 B = 6)
  // er en uenighed at pege på, ikke fire ✓.
  it('videreHold er null ved overskud, selv når hovedrundegruppen er klar', () => {
    const kampe = [...INDL_FACIT,
      kamp(8, 'Tyskland', 'Italien'), kamp(8, 'Serbien', 'Egypten'), kamp(10, 'Tunesien', 'Italien'), kamp(10, 'Uruguay', 'Egypten')];
    const o = grupperOversigt(HVM27G, kampe);
    expect(o[1].grupper[0].status).toBe('klar'); // uden dette ville testen ikke nå vagten
    expect(o[0].grupper[0].videreHold).toBeNull();
  });
  it('præcis tre lagt ind (ingen overskud): ingen sådan advarsel', () => {
    const kampe = [...INDL_FACIT, ...hovedrundeKampe({ A: A_KNAEK_ORDEN.slice(0, 3) })];
    expect(grupperAdvarsel(HVM27G, kampe).join('\n')).not.toMatch(/går videre/);
  });
  // Alle seks A-kampe 25-25: alle fire står lige (delt). Stregen går gennem en delt plads, så
  // vi ved ikke, hvem der skulle være med — Tunesien «som nr. 1» er ingen uenighed.
  it('ingen Q1-advarsel, når stregen går gennem en delt plads', () => {
    const lige = Object.fromEntries(INDLEDENDE.filter((m) => m.gruppe === 'A').map((m) => [`${m.home}–${m.away}`, [25, 25]]));
    // Tunesien (nr. 4 i programrækkefølgen) ER lagt ind, Uruguay (nr. 3) er IKKE: uden vagten
    // ville «Uruguay som nr. 1» blive meldt, selv om alle fire står lige.
    const kampe = [...medFacit(INDLEDENDE, lige), ...hovedrundeKampe({ A: ['Tyskland', 'Serbien', 'Tunesien'] })];
    const a = grupperOversigt(HVM27G, kampe)[0].grupper[0];
    expect(a.raekker.map((r) => [r.rank, r.delt])).toEqual([[1, true], [1, true], [1, true], [1, true]]);
    expect(a.videreHold).not.toBeNull(); // uden dette ville testen ikke nå vagten
    expect(grupperAdvarsel(HVM27G, kampe)).toEqual([]);
  });
});

describe('grupperAdvarsel: kampe og data', () => {
  const INDL_FACIT = medFacit(INDLEDENDE, GRUPPE_A_KNAEK);
  it('en hovedrundekamp på tværs af grupper nævnes ved navn og tælles ikke', () => {
    const kampe = [...INDL_FACIT, ...hovedrundeKampe({ A: A_KNAEK_ORDEN.slice(0, 3) }), kamp(8, 'Tyskland', 'Kroatien')];
    expect(grupperAdvarsel(HVM27G, kampe)).toEqual([
      'Hovedrunde · dag 1: Tyskland–Kroatien — gruppe A og C er ikke i samme gruppe i hovedrunden. Kampen tælles ikke i grupperne.',
    ]);
    const gI = grupperOversigt(HVM27G, kampe)[1].grupper[0];
    expect(raekke(gI.raekker, 'Tyskland').played).toBe(2);
  });
  it('et hold uden indledende gruppe, og to hold fra samme gruppe', () => {
    const kampe = [kamp(8, 'Atlantis', 'Serbien'), kamp(8, 'Serbien', 'Uruguay')];
    expect(grupperAdvarsel(HVM27G, kampe)).toEqual([
      'Hovedrunde · dag 1: Atlantis–Serbien — Atlantis står ikke i nogen gruppe i den indledende runde. Kampen tælles ikke i grupperne.',
      'Hovedrunde · dag 1: Serbien–Uruguay — begge hold er fra gruppe A og har allerede mødt hinanden (resultatet medføres). Tjek kampen.',
    ]);
  });
  it('ugyldige grupper siges højt (ellers forsvinder fanen tavst); SL og et spil uden grupper: intet', () => {
    const game = medGrupper((g) => { g.faser[1].fase = 'Hovedrunden'; });
    const adv = grupperAdvarsel(game, []);
    expect(adv).toHaveLength(1);
    expect(adv[0]).toMatch(/^Grupperne er ugyldige \(fanen 📊 Grupper vises ikke\): .*«Hovedrunden»/);
    expect(grupperAdvarsel(SL, [])).toEqual([]);
    expect(grupperAdvarsel({ ...HVM27G, grupper: undefined }, [])).toEqual([]);
  });
});
