// ---------------------------------------------------------------------------
// inviteTemplate.test.js — Superliga-invitationens HTML-skabelon.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { superligaInviteHtml } = require('./inviteTemplate.js');

describe('superligaInviteHtml', () => {
  const base = {
    intro: 'Hej alle\nSidste år vandt Anders.',
    joinLink: 'https://tip.vejleaa.dk/tilmeld/superliga-2026/ABC123',
    leagueName: 'Kontorligaen',
  };

  it('bygger et komplet HTML-dokument med hero og CTA', () => {
    const html = superligaInviteHtml(base);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('Klar til revanche?');
    expect(html).toContain(base.joinLink);
    expect(html).toContain('Kontorligaen');
  });

  it('viser skærmbilleder af både runde-tip og pulje', () => {
    const html = superligaInviteHtml(base);
    expect(html).toContain('https://tip.vejleaa.dk/salgstale/runde.png');
    expect(html).toContain('https://tip.vejleaa.dk/salgstale/pulje.png');
  });

  it('præsenterer hele spillet, ikke kun puljen', () => {
    const html = superligaInviteHtml(base);
    for (const s of ['1, X eller 2', 'Combi-bonus', 'Chancen', 'Pulje-tippet', 'mini-liga', 'Runde-Botten', 'Elo']) {
      expect(html).toContain(s);
    }
    // Runde-tippet skal stå før puljen i mailen.
    expect(html.indexOf('salgstale/runde.png')).toBeLessThan(html.indexOf('salgstale/pulje.png'));
  });

  it('bevarer linjeskift i admins tekst', () => {
    const html = superligaInviteHtml(base);
    expect(html).toContain('Hej alle<br>Sidste &aring;r vandt Anders.'.replace('&aring;', 'å'));
  });

  it('escaper HTML i admins tekst og ligenavn', () => {
    const html = superligaInviteHtml({
      ...base,
      intro: '<script>alert(1)</script>',
      leagueName: 'A & B <b>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B &lt;b&gt;');
  });

  it('falder tilbage til app-url og standardnavn uden link/liga', () => {
    const html = superligaInviteHtml({ intro: 'Hej' });
    expect(html).toContain('vores liga');
    expect(html).toContain('href="https://tip.vejleaa.dk"');
  });

  it('kan kaldes helt uden argumenter', () => {
    expect(() => superligaInviteHtml()).not.toThrow();
  });
});
