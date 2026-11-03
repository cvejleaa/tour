// ---------------------------------------------------------------------------
// Håndbold-VM 2027 som det RIGTIGE spil (scripts/games.mjs + de 32 hold) og en
// hel turnering lagt ind fase for fase. Delt af pulsens tests (src/lib/
// puljeFacit.puls.test.js) og fladens (PuljeTip/PuljeAfsloering), så de tæller
// på produktionens kalender — 36 hovedrundekampe fra dag 8 — og ikke på
// testkalenderen i faseKalender.js (48 fra dag 7).
// ---------------------------------------------------------------------------
import { GAMES } from '../../scripts/games.mjs';
import { HAANDBOLD_VM2027_HOLD } from '../data/haandboldVm2027Hold';
import program from '../../scripts/haandbold-vm2027-program.json';

export const HVM27 = Object.freeze({
  ...GAMES.find((g) => g.id === 'hvm2027'), id: 'hvm2027', teams: HAANDBOLD_VM2027_HOLD,
});

export const INDLEDENDE = program.fixtures.map((f) => ({
  id: f.id, round: f.round, home: f.home, away: f.away, kickoff: Date.parse(f.kickoff),
}));

// Hovedrunden: fire grupper à seks hold, hver gruppe «tre mod tre» = 9 kampe,
// hvert hold 3 gange. 4 × 9 = 36, fordelt på dag 8-13.
export const HOVED_GRUPPER = [
  [['Danmark', 'Norge', 'Sverige'], ['Island', 'Kroatien', 'Slovenien']],
  [['Frankrig', 'Spanien', 'Portugal'], ['Tyskland', 'Egypten', 'Brasilien']],
  [['USA', 'Serbien', 'Nordmakedonien'], ['Argentina', 'Italien', 'Færøerne']],
  [['Polen', 'Tunesien', 'Japan'], ['Chile', 'Qatar', 'Bahrain']],
];
export const HOVED = HOVED_GRUPPER.flatMap(([a, b], g) => a.flatMap((h, i) => b.map((u, j) => ({
  id: `r${8 + ((i * 3 + j + g) % 6)}-hr-${g}-${i}-${j}`, round: 8 + ((i * 3 + j + g) % 6), home: h, away: u, kickoff: 1,
}))));
export const KVART = [
  { id: 'r14-a', round: 14, home: 'Danmark', away: 'Spanien', kickoff: 1, result: '1', homeGoals: 31, awayGoals: 30 },
  { id: 'r14-b', round: 14, home: 'Island', away: 'Tyskland', kickoff: 1, result: '2', homeGoals: 28, awayGoals: 30 },
  { id: 'r15-a', round: 15, home: 'Frankrig', away: 'Norge', kickoff: 1, result: '1', homeGoals: 30, awayGoals: 29 },
  { id: 'r15-b', round: 15, home: 'Kroatien', away: 'Portugal', kickoff: 1, result: '1', homeGoals: 27, awayGoals: 25 },
];
export const SEMI = [
  { id: 'r16-a', round: 16, home: 'Danmark', away: 'Tyskland', kickoff: 1 },
  { id: 'r16-b', round: 16, home: 'Frankrig', away: 'Kroatien', kickoff: 1 },
];
export const FINALE = [
  { id: 'r17-a', round: 17, home: 'Tyskland', away: 'Kroatien', kickoff: 1 },
  { id: 'r17-b', round: 17, home: 'Danmark', away: 'Frankrig', kickoff: 1 },
];
