// mailMarkdown (server-spejl) — render OG sikkerhed. Dette er den kopi, der
// faktisk sendes til modtagerne, så sikkerheds-påstandene bor her.
//
// CLAUDE.md: "assertér på det, der IKKE må stå." En generate-safe renderer
// bevises ved at vise, at et angreb ALDRIG når outputtet som levende HTML —
// ikke at vi "fjerner" det.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { mailMarkdown } from './mailMarkdown.js';

const HER = dirname(fileURLToPath(import.meta.url));

describe('mailMarkdown — sikkerhed (generate-safe)', () => {
  it('escaper rå HTML — <script> når aldrig outputtet som tag', () => {
    const ud = mailMarkdown('<script>alert(1)</script> og <b>fedt</b>');
    expect(ud).not.toMatch(/<script/);
    expect(ud).not.toMatch(/<b>/);
    expect(ud).toContain('&lt;script&gt;');
  });

  it('et link med javascript:-URL bliver IKKE et <a> — kun escaped tekst', () => {
    const ud = mailMarkdown('[klik](javascript:alert(1))');
    expect(ud).not.toMatch(/<a /);
    expect(ud).not.toContain('href="javascript:');
    expect(ud).toContain('[klik]'); // står som synlig, uskadelig tekst
  });

  it('et billede med data:-URL bliver IKKE et <img> (mail-klienter blokerer det)', () => {
    const ud = mailMarkdown('![x](data:image/png;base64,AAAA)');
    expect(ud).not.toMatch(/<img/);
  });

  it('et http-billede (ikke https) bliver IKKE et <img> — det ville stå knækket', () => {
    expect(mailMarkdown('![x](http://usikkert/a.png)')).not.toMatch(/<img/);
    // https derimod ER et billede.
    expect(mailMarkdown('![x](https://sikkert/a.png)')).toMatch(/<img src="https:\/\/sikkert\/a\.png"/);
  });

  it('en attribut-injektion i en URL kan ikke bryde ud af href (citationstegn escapes)', () => {
    const ud = mailMarkdown('[x](https://evil"onmouseover="alert(1))');
    // Det rå citationstegn findes ikke i outputtet — kun &quot;, så
    // onmouseover kan aldrig blive et levende attribut.
    expect(ud).not.toContain('"onmouseover');
    expect(ud).toContain('&quot;onmouseover');
  });

  it('on*=-handlere i teksten er bare ESCAPED tekst, aldrig et levende attribut', () => {
    const ud = mailMarkdown('<img src=x onerror=alert(1)>');
    expect(ud).not.toMatch(/<img/); // intet levende img-tag
    // Hele strengen står escaped — `&lt;img` kan ikke udføre onerror.
    expect(ud).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  // TM-fund: teksten FØR et matchet token på samme linje skal OGSÅ escapes.
  // De øvrige sikkerhedstests rammer enten intet token (fallback-grenen) eller
  // et token ved index 0, så `escapeHtml(rest.slice(0, m.index))` kunne fjernes
  // i BEGGE spejlfiler samtidig uden at fejle. Her står <script> FØR en gyldig
  // autolink-URL på samme linje: fjernes pre-token-escapen, bliver <script>
  // et levende tag.
  it('escaper tekst FØR et token på samme linje — <script> foran en URL forbliver escaped', () => {
    const ud = mailMarkdown('<script>alert(1)</script> se https://x.dk');
    expect(ud).not.toMatch(/<script/);
    expect(ud).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(ud).toContain('<a href="https://x.dk"'); // URL'en EFTER blev stadig et link
  });
});

describe('mailMarkdown — render (kernen)', () => {
  it('bevarer enkelt linjeskift som <br> (dagens opførsel)', () => {
    expect(mailMarkdown('linje et\nlinje to')).toBe('linje et<br>linje to');
  });

  it('gør en bar URL klikbar (dagens autolink bevaret — [LINK] bliver til en URL)', () => {
    const ud = mailMarkdown('Tilmeld her: https://tip.vejleaa.dk/tilmeld?kode=abc');
    expect(ud).toContain('<a href="https://tip.vejleaa.dk/tilmeld?kode=abc"');
  });

  it('**fed** → <strong>, *kursiv* → <em>', () => {
    expect(mailMarkdown('helt **fed** her')).toContain('<strong>fed</strong>');
    expect(mailMarkdown('lidt *skrå* her')).toContain('<em>skrå</em>');
  });

  it('[tekst](https://…) → link med den viste tekst, ikke URL\'en', () => {
    const ud = mailMarkdown('[stillingen](https://tip.vejleaa.dk/spil)');
    expect(ud).toContain('<a href="https://tip.vejleaa.dk/spil"');
    expect(ud).toContain('>stillingen</a>');
  });

  it('# Overskrift → <h1/2/3>', () => {
    expect(mailMarkdown('# Stor')).toMatch(/<h1 [^>]*>Stor<\/h1>/);
    expect(mailMarkdown('## Mellem')).toMatch(/<h2 [^>]*>Mellem<\/h2>/);
    expect(mailMarkdown('### Lille')).toMatch(/<h3 [^>]*>Lille<\/h3>/);
  });

  it('`- ` samler efterfølgende linjer i ét <ul> med <li>', () => {
    const ud = mailMarkdown('- en\n- to\n- tre');
    expect(ud).toMatch(/<ul[^>]*><li>en<\/li><li>to<\/li><li>tre<\/li><\/ul>/);
  });

  it('`---` alene på en linje → <hr>', () => {
    expect(mailMarkdown('over\n---\nunder')).toMatch(/over<hr[^>]*>under/);
  });

  it('billede indsat som ![](https…) bliver et <img> med alt-tekst', () => {
    const ud = mailMarkdown('![stilling](https://x.dk/tab.png)');
    expect(ud).toContain('<img src="https://x.dk/tab.png" alt="stilling"');
  });
});

describe('mailMarkdown — bevarer eksisterende mails (ingen utilsigtet omfortolkning)', () => {
  // "Indsæt top 5" skriver `4. David – 25 point`. En <ol> ville tælle den om
  // til 1. — derfor er ordnede lister BEVIDST udeladt. Bånd: linjen skal stå
  // som tekst, IKKE som liste.
  it('en linje som "4. David" bliver IKKE en ordnet liste (top5 bevaret)', () => {
    const ud = mailMarkdown('Sådan endte ligaen:\n\n🥇 Anna – 42 point\n4. David – 25 point');
    expect(ud).not.toMatch(/<[ou]l/);
    expect(ud).not.toMatch(/<li>/);
    expect(ud).toContain('4. David – 25 point');
  });

  it('almindelig prosa med bindestreger og punktum bliver ikke reformateret', () => {
    const ud = mailMarkdown('Vi ses kl. 17.05 - husk at tippe. Det tager 2 minutter.');
    expect(ud).not.toMatch(/<(strong|em|ul|li|h[1-3]|hr)\b/);
    expect(ud).toBe('Vi ses kl. 17.05 - husk at tippe. Det tager 2 minutter.');
  });
});

describe('mailMarkdown — spejl-paritet med src/lib', () => {
  // De to filer SKAL være identiske pånær modul-systemets export-linje.
  // Driver de fra hinanden, renderer preview og server forskelligt — og
  // preview lyver om, hvad modtageren får.
  it('functions-platform/mailMarkdown.js er byte-identisk med src/lib pånær export', () => {
    const src = readFileSync(resolve(HER, '../src/lib/mailMarkdown.js'), 'utf8')
      .replace('export function mailMarkdown', 'function mailMarkdown')
      .trimEnd();
    const cjs = readFileSync(resolve(HER, 'mailMarkdown.js'), 'utf8')
      .replace(/\nmodule\.exports = \{ mailMarkdown \};\s*$/, '')
      .trimEnd();
    expect(cjs).toBe(src);
  });
});
