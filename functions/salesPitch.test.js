import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { salesPitchHtml } = require('./salesPitch');

describe('salesPitchHtml', () => {
  const opts = {
    intro: 'Kære alle,\nKom nu med <i det her>!',
    joinLink: 'https://tour.vejleaa.dk/tilmeld?kode=X4KR2M',
    leagueName: 'Familie & venner',
  };

  it('indeholder den gule blok med knap til liga-tilmeldingslinket', () => {
    const html = salesPitchHtml(opts);
    expect(html).toContain('#f7d417'); // den gule blok
    expect(html).toContain('href="https://tour.vejleaa.dk/tilmeld?kode=X4KR2M"');
    expect(html).toContain('V&aelig;r med nu');
  });

  it('bruger hostede skærmbilleder (aldrig base64 — Gmail klipper store mails)', () => {
    const html = salesPitchHtml(opts);
    expect(html).toContain('https://tour.vejleaa.dk/salgstale/etaper.png');
    expect(html).toContain('https://tour.vejleaa.dk/salgstale/hold.png');
    expect(html).toContain('https://tour.vejleaa.dk/salgstale/holdoversigt.png');
    expect(html).not.toContain('base64');
    expect(html.length).toBeLessThan(20000);
  });

  it('escaper intro-teksten og laver linjeskift om til <br>', () => {
    const html = salesPitchHtml(opts);
    expect(html).toContain('Kære alle,<br>');
    expect(html).toContain('&lt;i det her&gt;');
    expect(html).not.toContain('<i det her>');
  });

  it('nævner liganavnet i den gule blok (escaped)', () => {
    const html = salesPitchHtml(opts);
    expect(html).toContain('Familie &amp; venner');
  });

  it('falder tilbage til appUrl som knap-mål og "vores liga" uden liga', () => {
    const html = salesPitchHtml({ intro: 'Hej' });
    expect(html).toContain('href="https://tour.vejleaa.dk"');
    expect(html).toContain('vores liga');
  });

  it('sidste chance-vinklen er med i heroen', () => {
    const html = salesPitchHtml(opts);
    expect(html).toContain('Sidste chance');
    expect(html).toContain('17.05');
  });

  it('beskriver liga-siden (stilling, væg/bot, egne bonusspørgsmål)', () => {
    const html = salesPitchHtml(opts);
    expect(html).toContain('liga-siden');
    expect(html).toContain('Daglig stilling');
    expect(html).toContain('Tour-Botten');
    expect(html).toContain('hvem har tippet?');
  });

  it('henviser til hjælpesiden og profil-mulighederne', () => {
    const html = salesPitchHtml(opts);
    expect(html).toContain('href="https://tour.vejleaa.dk/hjaelp"');
    expect(html).toContain('Din profil');
    expect(html).toContain('yndlingshold');
    expect(html).toContain('p&aring;mindelser');
  });
});
