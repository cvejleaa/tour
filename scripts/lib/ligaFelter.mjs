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
