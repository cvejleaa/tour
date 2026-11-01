// ---------------------------------------------------------------------------
// scripts/lib/sportprofilGolden.mjs — det faste scenarie bag sportsprofilens
// facit. Delt mellem scripts/sportprofil-golden.mjs (der SKREV facit med koden
// før sportProfil) og testene (der efterprøver koden efter). Ét sted, så de to
// ikke kan regne på hver sit scenarie og alligevel blive enige.
// ---------------------------------------------------------------------------

/** Runde 1..N har facit; resten ligger i fremtiden og bliver omprist. */
export const GOLDEN_SPILLEDE_RUNDER = 10;

/** "Nu" for omprisningen — før første kickoff i begge programmer (SL 24/7, PL 21/8). */
export const GOLDEN_NU_MS = Date.parse('2026-07-01T00:00:00Z');

/**
 * Et konstrueret, men fast facit pr. kamp-id. Ikke de rigtige resultater —
 * de ændrer sig hen over sæsonen, og et facit, der flytter sig, er ikke et
 * facit. Alle tre udfald forekommer, så både sejr, uafgjort og nederlag går
 * gennem updateElo.
 */
export function goldenResultat(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 1_000_003;
  return ['1', 'X', '2'][h % 3];
}

/**
 * Kampene til servervejen: runde 1..GOLDEN_SPILLEDE_RUNDER med facit, resten
 * uden. Bygges af de seedede kampe (id, runde, hold, kickoff).
 */
export function goldenKampe(seedede) {
  return seedede.map((m) => ({
    id: m.id, round: m.round, home: m.home, away: m.away,
    kickoff: Date.parse(m.kickoff),
    ...(m.round <= GOLDEN_SPILLEDE_RUNDER ? { result: goldenResultat(m.id) } : {}),
  }));
}

/** Minimal fake-Firestore: ét spil-dokument + dets kampe (samme form som i gameScoring.test.js). */
export function makeEloDb(gameData, matchList) {
  const game = { ...gameData };
  const matches = matchList.map((m) => ({ data: { ...m } }));
  matches.forEach((m) => { m.ref = { __match: m }; });
  const gameRef = {
    async get() { return { exists: true, data: () => game }; },
    set(data) { Object.assign(game, data); },
    collection() {
      return { async get() { return { docs: matches.map((m) => ({ id: m.data.id, ref: m.ref, data: () => m.data })) }; } };
    },
  };
  return {
    _game: game,
    _matches: matches,
    collection: () => ({ doc: () => gameRef }),
    batch: () => ({
      _ops: [],
      update(ref, data) { this._ops.push({ ref, data }); },
      async commit() { for (const op of this._ops) Object.assign(op.ref.__match.data, op.data); },
    }),
  };
}
