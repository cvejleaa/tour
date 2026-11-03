// ---------------------------------------------------------------------------
// Håndbold-VM 2027 med GRUPPER — FORMATTRO testfixture for src/lib/grupper.js
// og fladerne, der viser grupperne.
//
// Formattro betyder: grupperne er kampprogrammets (scripts/haandbold-vm2027-
// program.json, fixturens `gruppe`-felt), og hovedrunden parrer holdene
// præcis som IHF/Wikipedia-siden gør (Main round, raw2027 — I = A+B, II = C+D,
// III = E+F, IV = G+H; «A1–B3, B1–A2, A3–B2» osv.), med gruppe I og III på dag
// 8, 10, 12 og II og IV på dag 9, 11, 13. Brug IKKE HOVED_GRUPPER i
// hvm2027Faser.js til grupper: den blander grupperne med vilje ligegyldigt.
//
// `game.grupper` bygges HER af programmets fixtures (samme form som
// datakontrakten), så testene ikke afhænger af, hvornår scripts/games.mjs får
// sin kopi. Rækkefølgen i en gruppe er PROGRAMRÆKKEFØLGEN: holdenes første
// optræden i programmet sorteret på (kickoff, id).
// ---------------------------------------------------------------------------
import { GAMES } from '../../scripts/games.mjs';
import { HAANDBOLD_VM2027_HOLD } from '../data/haandboldVm2027Hold';
import program from '../../scripts/haandbold-vm2027-program.json';

const SORTERET = [...program.fixtures].sort((a, b) => (Date.parse(a.kickoff) - Date.parse(b.kickoff)) || a.id.localeCompare(b.id));

function indledendeGrupper() {
  const g = new Map();
  for (const f of SORTERET) {
    if (!g.has(f.gruppe)) g.set(f.gruppe, []);
    for (const h of [f.home, f.away]) if (!g.get(f.gruppe).includes(h)) g.get(f.gruppe).push(h);
  }
  return [...g.keys()].sort().map((navn) => ({ navn, hold: g.get(navn) }));
}

export const GRUPPER = Object.freeze({
  point: { sejr: 2, uafgjort: 1 },
  faser: [
    { fase: 'Indledende runde', videre: 3, grupper: indledendeGrupper() },
    {
      fase: 'Hovedrunde',
      videre: 2,
      grupper: [{ navn: 'I', fra: ['A', 'B'] }, { navn: 'II', fra: ['C', 'D'] }, { navn: 'III', fra: ['E', 'F'] }, { navn: 'IV', fra: ['G', 'H'] }],
    },
  ],
});

/** Spillet som det rigtige (games.mjs + de 32 hold) MED grupper. */
export const HVM27G = Object.freeze({
  ...GAMES.find((g) => g.id === 'hvm2027'), id: 'hvm2027', teams: HAANDBOLD_VM2027_HOLD, grupper: GRUPPER,
});

/** De 48 kampe i den indledende runde, uden facit. */
export const INDLEDENDE = SORTERET.map((f) => ({
  id: f.id, round: f.round, home: f.home, away: f.away, kickoff: Date.parse(f.kickoff), gruppe: f.gruppe,
}));

const ELO = new Map(HAANDBOLD_VM2027_HOLD.map((t) => [t.name, t.elo]));

/** Facit, hvor det stærkeste hold (start-Elo) vinder 30–25. */
export function eloFacit(m) {
  const hjemmeVinder = ELO.get(m.home) > ELO.get(m.away);
  return { ...m, result: hjemmeVinder ? '1' : '2', homeGoals: hjemmeVinder ? 30 : 25, awayGoals: hjemmeVinder ? 25 : 30 };
}

/** Facit fra en tabel {'Hjemme–Ude': [h, u]}; øvrige kampe efter eloFacit. */
export function medFacit(kampe, saerlige = {}) {
  // En nøgle, der ikke matcher en kamp, ville tavst give Elo-facit (CLAUDE.md:
  // en erstatning, der ikke matcher, fejler tavst) — så hellere kaste.
  const findes = new Set(kampe.map((m) => `${m.home}–${m.away}`));
  const ukendte = Object.keys(saerlige).filter((k) => !findes.has(k));
  if (ukendte.length) throw new Error(`medFacit: ingen kamp hedder ${ukendte.join(', ')}`);
  return kampe.map((m) => {
    const s = saerlige[`${m.home}–${m.away}`];
    if (!s) return eloFacit(m);
    const [h, u] = s;
    return { ...m, result: h > u ? '1' : h < u ? '2' : 'X', homeGoals: h, awayGoals: u };
  });
}

/** Gruppens hold i Elo-orden — stillingen, når eloFacit afgør alle kampe. */
export function eloOrden(gruppe) {
  return [...GRUPPER.faser[0].grupper.find((g) => g.navn === gruppe).hold].sort((a, b) => ELO.get(b) - ELO.get(a));
}

// Hovedrundens parringer pr. spilledag, som på siden: x = første fra-gruppe
// (A/C/E/G), y = anden (B/D/F/H); tallet er placeringen.
const PARRINGER = [
  [['x1', 'y3'], ['y1', 'x2'], ['x3', 'y2']],
  [['x2', 'y3'], ['y2', 'x1'], ['x3', 'y1']],
  [['y1', 'x1'], ['y2', 'x2'], ['y3', 'x3']],
];
// Gruppe → [fra, første runde]. I og III: dag 8, 10, 12; II og IV: dag 9, 11, 13.
const HOVED = [['I', 'A', 'B', 8], ['II', 'C', 'D', 9], ['III', 'E', 'F', 8], ['IV', 'G', 'H', 9]];

/**
 * Hovedrundens 36 kampe (uden facit).
 * @param {Record<string,string[]>} [placering] gruppe → [nr. 1, nr. 2, nr. 3];
 *   standard: Elo-ordenen (= stillingen med eloFacit)
 * @param {{runder?: number[]}} [o] kun disse runder
 */
export function hovedrundeKampe(placering = {}, { runder } = {}) {
  const plads = (g, n) => (placering[g] || eloOrden(g))[n - 1];
  const ud = [];
  for (const [navn, x, y, start] of HOVED) {
    PARRINGER.forEach((dag, d) => {
      const round = start + 2 * d;
      if (runder && !runder.includes(round)) return;
      for (const [a, b] of dag) {
        const hold = (k) => plads(k[0] === 'x' ? x : y, Number(k[1]));
        const home = hold(a);
        const away = hold(b);
        ud.push({ id: `r${round}-${navn}-${a}${b}`, round, home, away, kickoff: Date.parse(`2027-01-${12 + round}T17:00:00Z`) });
      }
    });
  }
  return ud;
}

// GRUPPE A MED ET KNÆK (til medførte resultater og Q1). Programrækkefølge:
// Serbien, Uruguay, Tyskland, Tunesien.
//   Tyskland slår Serbien og Tunesien, men taber til Uruguay   → 4 point
//   Serbien slår Tunesien og Uruguay                           → 4 point
//   Tunesien slår Uruguay                                      → 2 point
//   Uruguay slår Tyskland                                      → 2 point
// Stillingen: Tyskland (indbyrdes sejr over Serbien), Serbien, Tunesien
// (indbyrdes sejr over Uruguay), Uruguay. Tyskland slog begge
// medkvalificerede og tabte til nr. 4; Tunesien tabte til begge og slog nr. 4.
export const GRUPPE_A_KNAEK = {
  'Serbien–Uruguay': [31, 24],
  'Tyskland–Tunesien': [32, 26],
  'Uruguay–Tyskland': [28, 27],
  'Serbien–Tunesien': [29, 25],
  'Tunesien–Uruguay': [27, 23],
  'Tyskland–Serbien': [30, 28],
};
export const A_KNAEK_ORDEN = ['Tyskland', 'Serbien', 'Tunesien', 'Uruguay'];
