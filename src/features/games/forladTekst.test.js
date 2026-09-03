import { describe, it, expect } from 'vitest';
import { forladBekraeftelse, forladPointAdvarsel } from './forladTekst';

const spil = { id: 'sl', name: 'Superligaen 2026/27' };

describe('forladBekraeftelse — første dialog', () => {
  it('nævner spillet og siger præcis hvad der sker: stilling, ligaer, kommende tips væk — spillede tips bliver', () => {
    const t = forladBekraeftelse(spil);
    expect(t).toContain('Forlad "Superligaen 2026/27"?');
    expect(t).toContain('forsvinder fra stillingen og dine ligaer');
    expect(t).toContain('tips på kommende kampe slettes');
    expect(t).toContain('allerede er spillet, bliver stående');
    // Må IKKE love en sletning, serveren ikke udfører (arkiv-modellen).
    expect(t).not.toMatch(/point.*slettes|slettes.*point/i);
  });
});

describe('forladPointAdvarsel — anden dialog, kun med point', () => {
  it('siger tallet med dansk komma, spillets navn, og at pointene arkiveres — ikke slettes', () => {
    const t = forladPointAdvarsel(spil, 12.5);
    expect(t).toContain('Du står med 12,5 point i Superligaen 2026/27.');
    expect(t).toContain('ingen nye point, mens du er ude');
    expect(t).toContain('kommer du tilbage i sæsonen, får du din stilling igen');
    expect(t).toContain('Vil du forlade spillet?');
    expect(t).not.toContain('12.5');
    expect(t).not.toMatch(/kan ikke tildeles igen/);
  });

  it('hele point skrives uden decimal', () => {
    expect(forladPointAdvarsel(spil, 7)).toContain('Du står med 7 point');
  });
});
