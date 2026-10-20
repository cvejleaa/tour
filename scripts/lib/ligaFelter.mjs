import { LQ_TYPES } from '../../src/features/games/leagueQuestionScoring.js';

// Ren vagt, delt af scan-scriptet og dets test: siger det samme som reglen
// for `leagues/{id}` og `games/{g}/leagues/{id}` — et id-felt eller et navn,
// der ikke er en streng, gør dokumentet FROSSET for ejeren efter udrulning.

/** Fejlene i ét liga-dokument — tom liste = reglen vil tage imod det. */
export function ligaFejl(data) {
  const fejl = [];
  if ('id' in data) fejl.push(`id-felt (${JSON.stringify(data.id)})`);
  if (typeof data.name !== 'string') fejl.push(`name er ${data.name === undefined ? 'fraværende' : typeof data.name}`);
  return fejl;
}

// ---------------------------------------------------------------------------
// Liga-spørgsmål, svar og væg-beskeder (#234): reglerne typevagter dem nu ved
// skrivning, og klienten tåler ældre gift — men et ældre spørgsmål med fx
// `deadline: 'abc'` er MURET INDE: reglen afviser rettelse, sletning og svar
// (evalueringsfejl i `now < deadline`), så kun facit kan sættes. Scanningen
// finder dem, så de kan ryddes med Admin SDK. Grænserne spejler reglen
// (firestore.rules, questions/questionAnswers/messages) — paritetstesten i
// ligaFelter.test.mjs læser reglen og holder dem ens.
// ---------------------------------------------------------------------------

/** Spørgsmålstyperne — klientens egen liste (ren ESM, ingen browser-afhængigheder). */
export const SPOERGSMAAL_TYPER = LQ_TYPES;
export const LABEL_MIN = 3;
export const LABEL_MAKS = 120;
export const FACIT_MAKS = 200;
export const SVAR_MAKS = 200;
export const ALTERNATIVER_MAKS = 20;
export const BESKED_MAKS = 280;
export const BESKED_FELTER = ['uid', 'text', 'createdAt'];

const erTimestamp = (v) => v != null && typeof v === 'object' && typeof v.toMillis === 'function';
const typen = (v) => (v === undefined ? 'fraværende' : v === null ? 'null' : Array.isArray(v) ? 'liste' : typeof v);

/** Fejlene i ét liga-spørgsmål (games/{g}/leagues/{l}/questions/{q}). */
export function spoergsmaalFejl(data) {
  const fejl = [];
  if (typeof data.label !== 'string') fejl.push(`label er ${typen(data.label)}`);
  else if (data.label.length < LABEL_MIN || data.label.length > LABEL_MAKS) fejl.push(`label på ${data.label.length} tegn`);
  if (data.facit != null) {
    if (typeof data.facit !== 'string') fejl.push(`facit er ${typen(data.facit)}`);
    else if (data.facit.length === 0 || data.facit.length > FACIT_MAKS) fejl.push(`facit på ${data.facit.length} tegn`);
  }
  if (data.acceptedAnswers !== undefined) {
    if (!Array.isArray(data.acceptedAnswers)) fejl.push(`acceptedAnswers er ${typen(data.acceptedAnswers)}`);
    else if (data.acceptedAnswers.length > ALTERNATIVER_MAKS) fejl.push(`acceptedAnswers med ${data.acceptedAnswers.length} elementer`);
  }
  if (data.type !== undefined && !SPOERGSMAAL_TYPER.includes(data.type)) fejl.push(`type er ${JSON.stringify(data.type)}`);
  // deadline: null/fraværende eller et tal. En streng eller et map murer spørgsmålet inde.
  if (data.deadline != null && typeof data.deadline !== 'number') fejl.push(`deadline er ${typen(data.deadline)} — spørgsmålet er muret inde`);
  if (typeof data.points !== 'number') fejl.push(`points er ${typen(data.points)}`);
  return fejl;
}

/** Fejlene i ét svar (games/{g}/leagues/{l}/questionAnswers/{q_uid}). */
export function svarFejl(data) {
  const fejl = [];
  if (typeof data.answer !== 'string') fejl.push(`answer er ${typen(data.answer)}`);
  else if (data.answer.length === 0 || data.answer.length > SVAR_MAKS) fejl.push(`answer på ${data.answer.length} tegn`);
  return fejl;
}

/** Fejlene i én væg-besked (games/{g}/leagues/{l}/messages/{id}) — bottens (system:true) er serverens og springes over. */
export function beskedFejl(data) {
  if (data.system === true) return [];
  const fejl = [];
  const ekstra = Object.keys(data).filter((k) => !BESKED_FELTER.includes(k));
  if (ekstra.length) fejl.push(`ekstra felter: ${ekstra.join(', ')}`);
  if (typeof data.text !== 'string') fejl.push(`text er ${typen(data.text)}`);
  else if (data.text.length === 0 || data.text.length > BESKED_MAKS) fejl.push(`text på ${data.text.length} tegn`);
  if (!erTimestamp(data.createdAt)) fejl.push(`createdAt er ${typen(data.createdAt)}`);
  return fejl;
}
