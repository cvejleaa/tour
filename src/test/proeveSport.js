// ---------------------------------------------------------------------------
// En PRØVESPORT til testene af sportsprofilen.
//
// Så længe fodbold er den eneste profil, er en fjernet profil i et kald
// usynlig: standardværdierne ER fodboldens tal. Et kaldested, der glemte
// spillets profil, ville stå grønt i hver eneste test — og først give forkerte
// odds den dag, håndbolden kom. Derfor lægger testene en sport ind, hvor HVERT
// tal adskiller sig fra fodbold, og kræver, at det slår igennem.
//
// Tallene er valgt efter, hvad de skal kunne fange, ikke efter en rigtig sport:
//   START 1000   et ukendt hold får 1000, ikke 1500
//   HFA 0        neutral bane: lige hold giver 1 = 2
//   K 40         dobbelt så store Elo-udsving
//   DRAW_BASE    0,05 — få uafgjorte, så favoritten kan nå over p = 0,909 …
//   DRAW_DECAY   0,2
//   odds.min     1,01 — … og gulvet dér faktisk kan ses (1,07 i stedet for 1,10)
//   odds.max     20 — et loft, hvor fodbold har null (intet), og et ANDET end
//                håndboldens 25: en tekst eller pris, der har skrevet 25 af,
//                bliver rød her
// ---------------------------------------------------------------------------
import { beforeAll, afterAll } from 'vitest';
import { SPORT_PROFILER } from '../lib/superligaScoring';

export const PROEVE = Object.freeze({
  sport: 'proeve',
  elo: Object.freeze({ START: 1000, HFA: 0, K: 40, DRAW_BASE: 0.05, DRAW_DECAY: 0.2 }),
  odds: Object.freeze({ min: 1.01, max: 20 }),
});

/** Registrér prøvesporten for hele den omgivende describe — og fjern den igen. */
export function medProeveSport() {
  beforeAll(() => { SPORT_PROFILER.proeve = PROEVE; });
  afterAll(() => { delete SPORT_PROFILER.proeve; });
}
