import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

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
