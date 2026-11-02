'use strict';

// Ryk-mailen til spillere, der mangler pulje-tippet.
//
// TRUKKET UD AF CALLABLE'EN (gamePuljeStatus i index.js), fordi teksten stod
// inline uden test og lovede «sæsonens bonusspørgsmål … sæsonafslutningen» i
// alle spil — også i en turnering, hvor puljen («semifinalisterne») afgøres
// midt i turneringen, når semifinalerne er lagt ind. Ordene kommer nu fra
// samme kilde som resten af appen (`rundeOrdene` i faser.js), så en liga
// læser byte for byte som før, og en turnering siger «turneringens».

const { rundeOrdene } = require('./faser');

/**
 * @param {object} p
 * @param {string} p.navn          modtagerens visningsnavn (uescapet)
 * @param {string} p.gameName      spillets navn (uescapet)
 * @param {string|null} p.deadlineTxt  formateret deadline, eller null
 * @param {object} p.game          spil-dokumentet (til ordene)
 * @param {object} p.konfig        puljeKonfig(game)
 * @param {string} p.appUrl
 * @param {(s: string) => string} p.escapeHtml
 * @returns {{subject: string, html: string}}
 */
function puljeRykMail({ navn, gameName, deadlineTxt, game, konfig, appUrl, escapeHtml }) {
  const o = rundeOrdene(game);
  // En runde-pulje afgøres af en fase (fx semifinalerne), ikke af den sidste
  // kamp — «til sæsonafslutningen» ville være forkert om både tid og ord.
  const hvornaar = konfig && konfig.facitKilde === 'runde'
    ? 'det er dér, de store bonuspoint ligger.'
    : `det er dér, de store bonuspoint ligger til ${o.saesonens === 'sæsonens' ? 'sæsonafslutningen' : 'turneringens afslutning'}.`;
  const html = `
          <p>Hej ${escapeHtml(navn)} 👋</p>
          <p>Du mangler at sætte dit <strong>pulje-tip</strong> (${o.saesonens} bonusspørgsmål) i ${escapeHtml(gameName)} —
          ${hvornaar}</p>
          ${deadlineTxt ? `<p>Deadline: <strong>${escapeHtml(deadlineTxt)}</strong>.</p>` : ''}
          <p><a href="${appUrl}">Sæt dit pulje-tip på tip.vejleaa.dk</a> — det tager to minutter.</p>
          <p style="color:#888;font-size:12px">Du kan slå påmindelser fra på din profilside.</p>`;
  const subject = `Husk pulje-tippet i ${gameName}${deadlineTxt ? ` — deadline ${deadlineTxt}` : ''}`;
  return { subject, html };
}

module.exports = { puljeRykMail };
