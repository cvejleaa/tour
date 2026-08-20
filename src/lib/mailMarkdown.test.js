// mailMarkdown (klient-spejl) — her bevises den mod de FAKTISKE eksisterende
// mailtekster (Arkitektens krav): skiftet fra "escape alt" til Markdown må
// ikke ændre udseendet af de mails, der virker i dag. Serveren har den
// tunge sikkerheds-suite (functions-platform/mailMarkdown.test.js); her
// vogter vi bevaringen af det bestående.
import { describe, it, expect, vi } from 'vitest';

// legacyResults.js importerer firebase på øverste niveau — mock det, så
// formatTop5Block kan testes som den rene funktion, den er.
vi.mock('../firebase', () => ({ db: {} }));

import { mailMarkdown } from './mailMarkdown';
import { REGELBREV_TEKST } from '../features/admin/regelbrev';
import { formatTop5Block } from '../features/admin/legacyResults';

describe('mailMarkdown — bevarer de faktiske eksisterende mails', () => {
  // Regelbrevet er lang dansk prosa. Den må renderes som tekst (+ evt. ægte
  // links), men ALDRIG få fed/kursiv/liste/overskrift af et tilfældigt
  // markdown-tegn i prosaen.
  it('regelbrevet reformateres ikke — ingen strong/em/ul/li/h fra prosaen', () => {
    const ud = mailMarkdown(REGELBREV_TEKST);
    expect(ud).not.toMatch(/<(strong|em|ul|li|h[1-3]|hr)\b/);
    expect(ud.length).toBeGreaterThan(100); // den blev faktisk renderet
  });

  // "Indsæt top 5" med en delt/normal placering: rank 1-3 = medaljer, 4+ = "N.".
  // En <ol> ville tælle "4." om til "1." — derfor bevidst ingen ordnet liste.
  it('top5-blokken bevares som tekst — "4." bliver ikke en omtalt liste', () => {
    const blok = formatTop5Block({
      name: 'Vennernes Liga',
      top: [
        { rank: 1, name: 'Anna', points: 42 },
        { rank: 2, name: 'Bo', points: 38 },
        { rank: 3, name: 'Cille', points: 30 },
        { rank: 4, name: 'David', points: 25 },
        { rank: 5, name: 'Ea', points: 20 },
      ],
    });
    const ud = mailMarkdown(blok);
    expect(ud).not.toMatch(/<[ou]l/);
    expect(ud).not.toMatch(/<li>/);
    expect(ud).toContain('4. David – 25 point');
    expect(ud).toContain('🥇 Anna – 42 point');
  });

  // DEFAULT_BODY-mønsteret: bullet-TEGN (•, ikke `- `), blanke linjer, en URL.
  it('bullet-tegn (•) og blanke linjer bevares som tekst med <br>', () => {
    const body = 'Kære alle\n\n• Punkt et\n• Punkt to\n\nSe https://tip.vejleaa.dk';
    const ud = mailMarkdown(body);
    expect(ud).not.toMatch(/<ul|<li>/); // • er tekst, ikke en <ul>
    expect(ud).toContain('• Punkt et<br>• Punkt to');
    expect(ud).toContain('Kære alle<br><br>• Punkt et');
    expect(ud).toContain('<a href="https://tip.vejleaa.dk"');
  });
});

describe('mailMarkdown — klientens nye konstrukter (kort; serveren har resten)', () => {
  it('fed, kursiv, link og billede renderer', () => {
    expect(mailMarkdown('**x**')).toContain('<strong>x</strong>');
    expect(mailMarkdown('*x*')).toContain('<em>x</em>');
    expect(mailMarkdown('[t](https://a.dk)')).toContain('>t</a>');
    expect(mailMarkdown('![a](https://a.dk/b.png)')).toContain('<img src="https://a.dk/b.png"');
  });

  // TM-fund (spejlet): tekst FØR et token på samme linje skal også escapes.
  it('escaper tekst FØR et token — <script> foran en URL forbliver escaped', () => {
    const ud = mailMarkdown('<script>alert(1)</script> se https://x.dk');
    expect(ud).not.toMatch(/<script/);
    expect(ud).toContain('&lt;script&gt;');
    expect(ud).toContain('<a href="https://x.dk"');
  });
});
