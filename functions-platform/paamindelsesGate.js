// ---------------------------------------------------------------------------
// paamindelsesGate.js — hvilke spil forventer daglige tip-påmindelser?
//
// SPEJLET PAR med src/features/games/spilEvner.js (forventerPaamindelser) —
// klienten kan ikke importere serverens moduler, så prædikatet findes to
// steder og bindes af paritetstesten i paamindelsesGate.test.js. Jobbet
// (index.js: gameTipReminders), DriftTabs forventede kort og Påmindelser-
// fanens knapper skal ALLE spørge her — før fandtes tre uenige kopier, og et
// spil kunne have en aktiv "Send nu"-knap, mens det daglige job sprang det
// over (proxy-gate-fælden fra CLAUDE.md).
//
// `paused` indgår med vilje IKKE: pausen er en TILSTAND, driftkortet
// rapporterer (gult/rødt via paamindelsesLinje), ikke en gate der fjerner
// kortet. Heller ikke gated på sync.provider: påmindelser afhænger ikke af
// en kilde — et håndseedet fodboldspil skal også rykke sine spillere.
// ---------------------------------------------------------------------------

/**
 * @param {{type?: string, status?: string}} game
 * @returns {boolean}
 */
function forventerPaamindelser(game) {
  return game?.type === 'football' && (game?.status === 'open' || game?.status === 'live');
}

module.exports = { forventerPaamindelser };
