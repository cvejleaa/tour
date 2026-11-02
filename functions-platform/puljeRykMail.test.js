import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { puljeRykMail } = require('./puljeRykMail');
const { escapeHtml } = require('./mailer');

const APP = 'https://tip.vejleaa.dk';
const FASER = [
  { navn: 'Indledende runde', fra: 1, til: 3, start: '2027-01-13' },
  { navn: 'Hovedrunde', fra: 4, til: 7, start: '2027-01-20' },
  { navn: 'Semifinaler', fra: 8, til: 8, start: '2027-01-29', knockout: true, antalKampe: 2 },
];

// Den gamle, inline tekst fra gamePuljeStatus (før udtrækket) — ordret. En liga
// skal give PRÆCIS den, ellers har udtrækket ændret SL/PL-mailen.
function gammel(navn, gameName, deadlineTxt) {
  return `
          <p>Hej ${escapeHtml(navn)} 👋</p>
          <p>Du mangler at sætte dit <strong>pulje-tip</strong> (sæsonens bonusspørgsmål) i ${escapeHtml(gameName)} —
          det er dér, de store bonuspoint ligger til sæsonafslutningen.</p>
          ${deadlineTxt ? `<p>Deadline: <strong>${escapeHtml(deadlineTxt)}</strong>.</p>` : ''}
          <p><a href="${APP}">Sæt dit pulje-tip på tip.vejleaa.dk</a> — det tager to minutter.</p>
          <p style="color:#888;font-size:12px">Du kan slå påmindelser fra på din profilside.</p>`;
}

const mail = (game, konfig, deadlineTxt = '13.01. 18.00', navn = 'Ann', gameName = game.name) =>
  puljeRykMail({ navn, gameName, deadlineTxt, game, konfig, appUrl: APP, escapeHtml });

describe('puljeRykMail', () => {
  it('liga (SL, officiel tabel): byte for byte den gamle mail — med og uden deadline', () => {
    const sl = { name: 'Superligaen 26/27', pulje: { facitKilde: 'officiel' } };
    expect(mail(sl, { facitKilde: 'officiel' }).html).toBe(gammel('Ann', sl.name, '13.01. 18.00'));
    expect(mail(sl, { facitKilde: 'officiel' }, null).html).toBe(gammel('Ann', sl.name, null));
    expect(mail(sl, { facitKilde: 'officiel' }).subject).toBe('Husk pulje-tippet i Superligaen 26/27 — deadline 13.01. 18.00');
    expect(mail(sl, { facitKilde: 'officiel' }, null).subject).toBe('Husk pulje-tippet i Superligaen 26/27');
  });

  it('liga (PL, egne kampe): også uændret', () => {
    const pl = { name: 'PL efterår', pulje: { facitKilde: 'egneKampe' } };
    expect(mail(pl, { facitKilde: 'egneKampe' }).html).toBe(gammel('Ann', pl.name, '13.01. 18.00'));
  });

  it('turnering med runde-pulje: turneringens ord og intet løfte om en afslutning', () => {
    const hb = { name: 'Håndbold-VM 2027', faser: FASER, pulje: { facitKilde: 'runde' } };
    const { html } = mail(hb, { facitKilde: 'runde' });
    expect(html).toContain('(turneringens bonusspørgsmål) i Håndbold-VM 2027');
    expect(html).toContain('det er dér, de store bonuspoint ligger.</p>');
    expect(html).not.toMatch(/sæson/i);
    expect(html).not.toContain('afslutning');
  });

  it('turnering med en ikke-runde-pulje: turneringens afslutning, aldrig sæsonens', () => {
    const t = { name: 'Turnering', faser: FASER, pulje: { facitKilde: 'egneKampe' } };
    const { html } = mail(t, { facitKilde: 'egneKampe' });
    expect(html).toContain('ligger til turneringens afslutning.</p>');
    expect(html).not.toMatch(/sæson/i);
  });

  it('escaper navn, spilnavn og deadline', () => {
    const sl = { name: 'x' };
    const { html } = mail(sl, null, '<b>d</b>', '<img src=x>', '<i>spil</i>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<i>spil');
    expect(html).not.toContain('<b>d');
    expect(html).toContain('&lt;img src=x&gt;');
  });
});

// LEDNINGEN i index.js (gamePuljeStatus). index.js kan ikke importeres uden
// firebase-functions, så kaldet bevogtes som tekst (mønstret fra
// gameScoring.test.js). Uden den kunne `game`, `konfig` eller `deadlineTxt`
// fjernes fra kaldet med hele suiten grøn (TM-fund X1-X3) — og uden `game`
// fik en turnering igen «sæsonens bonusspørgsmål», præcis den fejl,
// udtrækket blev lavet for at lukke.
describe('index.js: gamePuljeStatus sender spillet, konfigurationen og deadlinen med', () => {
  const kilde = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'index.js'), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  const kald = kilde.split('exports.gamePuljeStatus')[1].split('exports.')[0];

  it('ét kald med alle felter — game og konfig fra spillet selv', () => {
    expect(kald.match(/puljeRykMail\(/g)).toHaveLength(1);
    expect(kald).toMatch(/const \{ subject, html \} = puljeRykMail\(\{\s*navn: m\.name, gameName, deadlineTxt, game, konfig, appUrl: APP_URL, escapeHtml,\s*\}\);/);
    // konfig er spillets egen — ikke en tom eller en anden pulje.
    expect(kald).toMatch(/const konfig = puljeKonfig\(game\);/);
    // deadlineTxt er den formaterede lås — eller null uden lås.
    expect(kald).toMatch(/const deadlineTxt = lockMs != null\s*\?\s*new Date\(lockMs\)\.toLocaleString\('da-DK', \{ timeZone: TZ,[^}]*\}\)\s*:\s*null;/);
  });

  it('det er mailens EGET emne og indhold, der sendes', () => {
    expect(kald).toMatch(/await sendEmail\(db, transporter, \{\s*to: email,\s*subject,\s*html,\s*type: 'pulje-reminder',\s*\}\);/);
    expect(kald).not.toMatch(/subject:\s*`|html:\s*`/);
  });

  it('funktionen er index.js\' — ikke en lokal kopi', () => {
    expect(kilde).toMatch(/const \{ puljeRykMail \} = require\('\.\/puljeRykMail'\);/);
    expect(kilde).not.toMatch(/function puljeRykMail/);
  });
});
