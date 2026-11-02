// ---------------------------------------------------------------------------
// En TESTKALENDER for en håndboldturnering — ikke det rigtige VM-program.
//
// Det rigtige program kommer i delopgave 6 (scripts/games.mjs), bygget af det
// filtrerede program. Denne kalender er valgt efter, hvad testene skal kunne
// fange:
//   17 dage i alt   → "Dag 7 af 17", ikke "Runde 6 af 6"
//   dag 2 = tor 14/1 2027 → "Indledende runde · dag 2 · tor 14/1"
//   hovedrunden starter ons 20/1 → "Første kamp onsdag 20. januar"
//   to faser på én dag (Semifinaler, Finaledag) → etiket uden "· dag 1"
//   en fase uden `bestemt` (Finaledag) → navnet bruges i sætninger
//   knockout på de tre sidste faser, ikke på de to første
// Delt af klient- og servertestene (functions-platform/faser.test.js).
// ---------------------------------------------------------------------------
export const TEST_FASER = Object.freeze([
  Object.freeze({ navn: 'Indledende runde', bestemt: 'Den indledende runde', fra: 1, til: 6, start: '2027-01-13', antalKampe: 48 }),
  Object.freeze({ navn: 'Hovedrunde', bestemt: 'Hovedrunden', fra: 7, til: 13, start: '2027-01-20', antalKampe: 48 }),
  Object.freeze({ navn: 'Kvartfinaler', bestemt: 'Kvartfinalerne', fra: 14, til: 15, start: '2027-01-27', knockout: true, antalKampe: 4 }),
  Object.freeze({ navn: 'Semifinaler', bestemt: 'Semifinalerne', fra: 16, til: 16, start: '2027-01-29', knockout: true, antalKampe: 2 }),
  Object.freeze({ navn: 'Finaledag', fra: 17, til: 17, start: '2027-01-31', knockout: true, antalKampe: 2 }),
]);

/** Et håndboldspil med kalenderen. */
export const HAANDBOLD_SPIL = Object.freeze({
  id: 'hvm-test', type: 'football', sport: 'haandbold', name: 'Håndbold-VM 2027', shortName: 'VM', emoji: '🤾',
  faser: TEST_FASER,
});

/** Kickoff (ms) kl. 18.00 dansk tid (17.00 UTC i januar) på en dato. */
export function kl18(dato) {
  return Date.parse(`${dato}T17:00:00Z`);
}
