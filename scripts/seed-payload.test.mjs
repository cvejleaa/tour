// Hvad seedet må skrive på et spil — og hvad admin ejer.
//
// DEN DYRESTE KOBLING I HELE SPIL-OPRETTELSEN, og den var helt udækket:
// 'joinable' kunne fjernes fra ADMIN_OWNED med hele frontend-suiten grøn
// (1727 tests). Konsekvensen er tavs: PL seedes skjult, admin afslører
// spillet, og næste seed-kørsel — den eneste måde at tilføje flere kampe —
// skubber joinable: false tilbage med en merge-skrivning. Spillet forsvinder
// fra "Åbne spil — deltag" uden fejl og uden spor.
import { describe, it, expect } from 'vitest';
import { ADMIN_OWNED, seedPayload } from './seed-payload.mjs';
import { GAMES } from './games.mjs';

const NU = { _serverTimestamp: true };

describe('seedPayload — et spil, der ALLEREDE findes', () => {
  const data = {
    name: 'Premier League 2026/27 — efterår', status: 'open', joinable: true, order: 4,
  };

  it('rører hverken status eller joinable', () => {
    const p = seedPayload(data, { exists: true, now: NU });
    expect('status' in p).toBe(false);
    expect('joinable' in p).toBe(false);
  });

  it('skriver stadig de felter, listen faktisk ejer', () => {
    const p = seedPayload(data, { exists: true, now: NU });
    expect(p.name).toBe('Premier League 2026/27 — efterår');
    expect(p.order).toBe(4);
    expect(p.updatedAt).toBe(NU);
  });

  // createdAt på et eksisterende spil ville overskrive den rigtige
  // oprettelsesdato ved hver kørsel.
  it('sætter ikke createdAt igen', () => {
    expect('createdAt' in seedPayload(data, { exists: true, now: NU })).toBe(false);
  });

  // Konkret: admin har afsløret PL. Listen siger stadig joinable: false,
  // fordi spillet skal oprettes skjult. Næste seed-kørsel må IKKE skjule det
  // igen — det er præcis den tavse tilbagerulning, ADMIN_OWNED findes for.
  it('skjuler ikke et spil, admin har afsløret', () => {
    const fraListen = { name: 'PL', joinable: false, status: 'open' };
    const p = seedPayload(fraListen, { exists: true, now: NU });
    expect('joinable' in p).toBe(false);
  });
});

describe('seedPayload — et spil, der oprettes', () => {
  const data = { name: 'PL', status: 'open', joinable: false };

  // Ved oprettelsen er listen den ENESTE kilde: der er ikke noget admin-valg
  // at bevare endnu. Holdt denne gren også felterne tilbage, ville PL blive
  // oprettet helt uden joinable — og et manglende felt er falsy, altså skjult,
  // altså rigtigt ved et tilfælde. Den slags heldige udfald skal ikke bære en
  // beslutning.
  it('tager både status og joinable med fra listen', () => {
    const p = seedPayload(data, { exists: false, now: NU });
    expect(p.status).toBe('open');
    expect(p.joinable).toBe(false);
  });

  it('sætter createdAt', () => {
    expect(seedPayload(data, { exists: false, now: NU }).createdAt).toBe(NU);
  });
});

describe('ADMIN_OWNED', () => {
  it('omfatter præcis de felter, Spil-tidsplan skriver', () => {
    expect([...ADMIN_OWNED].sort()).toEqual(['joinable', 'status']);
  });

  // Hvert navn i listen skal svare til et felt, der faktisk findes på et spil.
  // En stavefejl ('joinabel') ville fjerne beskyttelsen uden at fejle.
  it('peger kun på felter, spil-listen kender', () => {
    const kendte = new Set(GAMES.flatMap((g) => Object.keys(g)));
    for (const f of ADMIN_OWNED) expect(kendte.has(f), f).toBe(true);
  });
});
