// broadcastHtml — den var UDÆKKET før mailMarkdown-skiftet. Nu dækkes
// render-stien: at brødteksten faktisk renderes via mailMarkdown, og at
// layout + platform-footer bevares (det er det, modtageren ser rundt om).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { broadcastHtml, APP_URL } = require('./mailer');

describe('broadcastHtml', () => {
  it('pakker brødteksten i mail-layout + platform-footer', () => {
    const ud = broadcastHtml('Hej');
    expect(ud).toContain('font-family:sans-serif');
    expect(ud).toContain('Hej');
    // Footeren peger på appen — én gang, som afsender-signatur.
    expect(ud).toContain(`Sendt fra Vejleaa Tip · <a href="${APP_URL}">${APP_URL}</a>`);
  });

  it('renderer Markdown via mailMarkdown (fed + billede virker i en broadcast)', () => {
    const ud = broadcastHtml('helt **fed**\n![t](https://a.dk/b.png)');
    expect(ud).toContain('<strong>fed</strong>');
    expect(ud).toContain('<img src="https://a.dk/b.png"');
  });

  it('bevarer dagens opførsel: \\n→<br> og bar URL bliver klikbar', () => {
    const ud = broadcastHtml('linje\nTilmeld: https://tip.vejleaa.dk/tilmeld?kode=x');
    expect(ud).toContain('linje<br>Tilmeld:');
    expect(ud).toContain('<a href="https://tip.vejleaa.dk/tilmeld?kode=x"');
  });

  it('escaper rå HTML i brødteksten — <script> når aldrig ud som tag', () => {
    const ud = broadcastHtml('<script>alert(1)</script>');
    expect(ud).not.toMatch(/<script>alert/);
    expect(ud).toContain('&lt;script&gt;');
  });
});
