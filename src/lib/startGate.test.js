// ---------------------------------------------------------------------------
// HVOR ET SPIL BEGYNDER.
//
// Gaten var en DATO ni steder — fem i gameScoring, to i reminders, én i
// gameRecap og én i footballRounds — og hver af dem sammenlignede kickoff med
// et tidspunkt. En runde er ikke et tidsrum, og derfor kunne en dato skære en
// runde midt over.
//
// Formen i testene herunder er afskrevet fra Superligaens runde 3: fire kampe
// 7.-10. august og to den 2.-3. september, altså efter hele runde 4, 5 og 6.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import {
  foerStart, gatedeKampe, fraStartRunde, rundeForTidspunkt, startRundeFor,
} from './startGate';

/** Runde 3 som den faktisk ligger i scripts/superliga-fixtures.json. */
const SPREDT_RUNDE = [
  { id: 'r2a', round: 2, kickoff: Date.parse('2026-08-01T16:00:00Z') },
  { id: 'r3a', round: 3, kickoff: Date.parse('2026-08-07T17:00:00Z') },
  { id: 'r3b', round: 3, kickoff: Date.parse('2026-08-09T12:00:00Z') },
  { id: 'r3c', round: 3, kickoff: Date.parse('2026-08-09T14:00:00Z') },
  { id: 'r3d', round: 3, kickoff: Date.parse('2026-08-10T15:00:00Z') },
  { id: 'r3e', round: 3, kickoff: Date.parse('2026-09-02T16:00:00Z') },
  { id: 'r3f', round: 3, kickoff: Date.parse('2026-09-03T16:00:00Z') },
  { id: 'r4a', round: 4, kickoff: Date.parse('2026-08-14T17:00:00Z') },
];

describe('foerStart', () => {
  it('gater på RUNDE, ikke på tidspunkt', () => {
    expect(foerStart({ round: 1 }, 2)).toBe(true);
    expect(foerStart({ round: 2 }, 2)).toBe(false);
    expect(foerStart({ round: 3 }, 2)).toBe(false);
  });

  it('gater ingenting uden en startrunde', () => {
    expect(foerStart({ round: 1 }, null)).toBe(false);
    expect(foerStart({ round: 1 }, undefined)).toBe(false);
  });

  // BÆRENDE. `null < 2` er `true` i JavaScript og `undefined < 2` er `false` —
  // to forskellige svar på "kampen har ingen runde". En naiv sammenligning
  // ville gate den ene og ikke den anden.
  it('gater ALDRIG en kamp uden rundenummer — hverken null eller undefined', () => {
    expect(foerStart({ round: null }, 5)).toBe(false);
    expect(foerStart({}, 5)).toBe(false);
    expect(foerStart({ round: undefined }, 5)).toBe(false);
    expect(foerStart(null, 5)).toBe(false);
    // …og bevis at den naive sammenligning VILLE have svaret forskelligt:
    expect(null < 5).toBe(true);
    expect(undefined < 5).toBe(false);
  });
});

describe('gatedeKampe', () => {
  it('tager hele runder, aldrig halve', () => {
    // HELE POINTET. Runde 3 ligger spredt fra 7. august til 3. september.
    // Med startrunde 3 er ALLE seks med; med 4 er ALLE seks ude.
    expect([...gatedeKampe(SPREDT_RUNDE, 3)]).toEqual(['r2a']);
    const uden3 = [...gatedeKampe(SPREDT_RUNDE, 4)];
    expect(uden3).toEqual(['r2a', 'r3a', 'r3b', 'r3c', 'r3d', 'r3e', 'r3f']);
    expect(uden3.filter((id) => id.startsWith('r3'))).toHaveLength(6);
  });

  it('er tom uden startrunde', () => {
    expect(gatedeKampe(SPREDT_RUNDE, null).size).toBe(0);
    expect(gatedeKampe(null, 3).size).toBe(0);
  });
});

describe('fraStartRunde', () => {
  it('er komplementet til gatedeKampe', () => {
    const vist = fraStartRunde(SPREDT_RUNDE, 3).map((m) => m.id);
    const gatet = gatedeKampe(SPREDT_RUNDE, 3);
    expect(vist).toHaveLength(SPREDT_RUNDE.length - gatet.size);
    expect(vist.some((id) => gatet.has(id))).toBe(false);
  });

  it('viser alt uden startrunde', () => {
    expect(fraStartRunde(SPREDT_RUNDE, null)).toHaveLength(8);
  });
});

describe('rundeForTidspunkt', () => {
  // Reglen: den FØRSTE runde, hvis TIDLIGSTE kickoff ligger på eller efter
  // tidspunktet. Den runder altså OP til en hel runde.
  it('peger på runden, der begynder på eller efter tidspunktet', () => {
    expect(rundeForTidspunkt(SPREDT_RUNDE, Date.parse('2026-08-01T16:00:00Z'))).toBe(2);
    expect(rundeForTidspunkt(SPREDT_RUNDE, Date.parse('2026-08-01T15:59:00Z'))).toBe(2);
  });

  // DET FAKTISKE TAL FOR SUPERLIGAEN. Admin viser `01.08.2026, 17.59` i dansk
  // tid, altså 15:59 UTC, og runde 2's første kamp er 16:00 UTC — ét minut
  // efter. Spillet starter altså med runde 2, og ingen runde er skåret over.
  it('oversætter Superligaens faktiske startAt til runde 2', () => {
    const startMs = Date.parse('2026-08-01T15:59:00Z');
    expect(rundeForTidspunkt(SPREDT_RUNDE, startMs)).toBe(2);
    expect([...gatedeKampe(SPREDT_RUNDE, 2)]).toEqual([]);
  });

  // OG DEN AFGØRENDE: en dato MIDT i en spredt runde runder OP, så runden
  // enten er helt med eller helt ude. Datoen herunder ligger efter runde 3's
  // fire augustkampe, før dens to septemberkampe og før runde 4 — præcis det
  // tilfælde, hvor den gamle gate gav en to-kamps combi-kupon på en halv runde.
  it('runder OP, så en spredt runde aldrig kan skæres over', () => {
    const midtIRunde3 = Date.parse('2026-08-12T00:00:00Z');
    expect(rundeForTidspunkt(SPREDT_RUNDE, midtIRunde3)).toBe(4);
    // Runde 3 er dermed HELT ude — også de to septemberkampe, som den gamle
    // dato-gate ville have ladet tælle.
    const gatet = gatedeKampe(SPREDT_RUNDE, 4);
    expect(gatet.has('r3e')).toBe(true);
    expect(gatet.has('r3f')).toBe(true);
  });

  it('gater alt, når tidspunktet ligger efter sidste runde', () => {
    // Sidste runde + 1, ikke null: null ville betyde "ingen gate" og lukke
    // spillet HELT op i stedet for at lukke det.
    expect(rundeForTidspunkt(SPREDT_RUNDE, Date.parse('2027-01-01T00:00:00Z'))).toBe(5);
    expect(gatedeKampe(SPREDT_RUNDE, 5).size).toBe(SPREDT_RUNDE.length);
  });

  it('giver null uden tidspunkt eller uden runder', () => {
    expect(rundeForTidspunkt(SPREDT_RUNDE, null)).toBeNull();
    expect(rundeForTidspunkt([], 1000)).toBeNull();
    expect(rundeForTidspunkt([{ id: 'x', kickoff: 5 }], 1000)).toBeNull();
  });

  it('ser bort fra kampe uden kickoff, når runden placeres', () => {
    const medHul = [
      { id: 'a', round: 1, kickoff: null },
      { id: 'b', round: 1, kickoff: 100 },
      { id: 'c', round: 2, kickoff: 500 },
    ];
    expect(rundeForTidspunkt(medHul, 100)).toBe(1);
    expect(rundeForTidspunkt(medHul, 101)).toBe(2);
  });
});

describe('startRundeFor', () => {
  it('bruger startRound, når feltet er sat', () => {
    expect(startRundeFor({ startRound: 7 }, SPREDT_RUNDE)).toBe(7);
  });

  // OVERGANGEN. Et spil, der endnu ikke er migreret, har kun den gamle dato.
  // Uden fallbacken ville en udrulning lukke runde 1 op for point.
  it('falder tilbage på det gamle startAt', () => {
    expect(startRundeFor({ startAt: Date.parse('2026-08-01T15:59:00Z') }, SPREDT_RUNDE)).toBe(2);
  });

  it('lader startRound vinde, når begge felter står', () => {
    const game = { startAt: Date.parse('2026-08-01T15:59:00Z'), startRound: 4 };
    expect(startRundeFor(game, SPREDT_RUNDE)).toBe(4);
  });

  it('giver null, når spillet ingen gate har', () => {
    expect(startRundeFor({}, SPREDT_RUNDE)).toBeNull();
    expect(startRundeFor(null, SPREDT_RUNDE)).toBeNull();
  });

  it('tager imod et Firestore-Timestamp som startAt', () => {
    const ts = { toMillis: () => Date.parse('2026-08-01T15:59:00Z') };
    expect(startRundeFor({ startAt: ts }, SPREDT_RUNDE)).toBe(2);
  });

  // startRound: 0 er en gyldig værdi og betyder "ingen runder gates".
  // Number.isFinite(0) er true, så feltet må ikke falde tilbage på datoen.
  it('behandler startRound 0 som en rigtig værdi, ikke som tomt', () => {
    expect(startRundeFor({ startRound: 0, startAt: 9e12 }, SPREDT_RUNDE)).toBe(0);
    expect(gatedeKampe(SPREDT_RUNDE, 0).size).toBe(0);
  });
});
