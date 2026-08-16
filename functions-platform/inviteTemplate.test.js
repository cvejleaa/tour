// ---------------------------------------------------------------------------
// inviteTemplate.test.js — invitations-skabelonen. SKAL følge spillet:
// den første udgave var hardcodet til Superligaen, så PL-launch-mailen
// lovede et pulje-tip, spillet ikke har. Testene her assertérer BÅDE hvad
// PL-mailen siger, og hvad den IKKE må sige (CLAUDE.md: en test, der kun
// tjekker at noget blev vist, beviser ikke hvad der stod).
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { invitationsHtml, ligaProfil } = require('./inviteTemplate.js');

// Bagudkompatibilitet: uden liga-profil er mailen Superligaens (gamle
// klienter sender intet gameId).
const superligaInviteHtml = (opts) => invitationsHtml(opts);

describe('invitationsHtml — Superligaen (default, bagudkompatibel)', () => {
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

describe('ligaProfil — profilen afledes af SPIL-DOKUMENTET', () => {
  const plSpil = { name: 'Premier League 2026/27 — efterår', sync: { provider: 'pulselive', competitionId: 8, season: 2026 } };
  const slSpil = { name: 'Superligaen 2026/27', sync: { provider: 'superliga' }, pulje: { poolSize: 6 } };

  it('null → Superligaens fulde profil (gamle klienter sender intet gameId)', () => {
    const l = ligaProfil(null);
    expect(l.navn).toBe('Superligaen');
    expect(l.harPulje).toBe(true);
    expect(l.rundeImg).toBe('salgstale/runde.png');
    expect(l.puljeImg).toBe('salgstale/pulje.png');
  });

  it('PL efterår: navn, "hele efteråret", 18-runder-chippen, INGEN pulje og INGEN billeder', () => {
    const l = ligaProfil(plSpil);
    expect(l.navn).toBe('Premier League');
    expect(l.overskrift).toBe('Ny liga, blanke tavler');
    expect(l.periode).toContain('efter');   // "hele efteråret" (entity-kodet å)
    expect(l.periode).not.toContain('s&aelig;son');
    expect(l.chip3).toContain('18 runder');
    expect(l.harPulje).toBe(false);
    expect(l.rundeImg).toBeNull();
    expect(l.puljeImg).toBeNull();
  });

  it('pulje er DATA, ikke en liga-liste: et pulselive-spil MED pulje får pulje-kapitlet', () => {
    const l = ligaProfil({ ...plSpil, pulje: { poolSize: 4 } });
    expect(l.harPulje).toBe(true);
    expect(l.poolSize).toBe(4);
    expect(l.puljeImg).toBeNull(); // men aldrig Superligaens billede
  });

  it('Superliga-spillet matcher default-profilen', () => {
    expect(ligaProfil(slSpil)).toEqual(ligaProfil(null));
  });

  it('ukendt provider: neutral profil uden SL-påstande og uden billeder', () => {
    const l = ligaProfil({ name: 'La Liga 2027', shortName: 'La Liga', sync: { provider: 'laliga-api' } });
    expect(l.navn).toBe('La Liga');
    expect(l.rundeImg).toBeNull();
    expect(l.puljeImg).toBeNull();
    expect(l.harPulje).toBe(false);
  });
});

describe('invitationsHtml — Premier League-invitationen', () => {
  const html = invitationsHtml({
    liga: ligaProfil({ name: 'Premier League 2026/27 — efterår', sync: { provider: 'pulselive' } }),
    intro: 'Er du klar?',
    joinLink: 'https://tip.vejleaa.dk/tilmeld?spil=pl2627-efteraar&kode=4GGR99',
    leagueName: 'Buddy ligaen',
  });

  it('hero og titel taler om Premier League og efteråret', () => {
    expect(html).toContain('Premier League skal tippes');
    expect(html).toContain('hele efter');
    expect(html).toContain('Ny liga, blanke tavler');
    expect(html).toContain('18 runder');
  });

  it('siger ALDRIG Superligaen — og viser ingen af dens skærmbilleder', () => {
    expect(html).not.toContain('Superliga');
    expect(html).not.toContain('salgstale/');
    expect(html).not.toContain('mesterskabsspillet');
  });

  it('lover INTET pulje-tip — liga-spørgsmålene står som den sene joker i stedet', () => {
    expect(html).not.toContain('Pulje-tippet');
    expect(html).toContain('Liga-sp&oslash;rgsm&aring;l');
    expect(html).toContain('vende stillingen');
    // ...og de gentages ikke i mini-liga-rækken (dobbelt løfte læses som fyld).
    expect(html.split('liga-admin').length).toBe(2); // nævnes præcis én gang
  });

  it('kernen består: 1X2, combi, chancen, Runde-Botten og den gule CTA', () => {
    for (const t of ['1, X eller 2', 'Combi-bonus', 'Chancen', 'Runde-Botten', 'Buddy ligaen', 'kode=4GGR99']) {
      expect(html).toContain(t);
    }
  });
});
