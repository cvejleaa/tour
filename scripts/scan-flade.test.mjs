// Vagt om inventaret bag Admin → Tests → Fladen. Et regex-scan fandt 131
// knapper, hvor parseren finder 225 — flerlinje-tags forsvandt. Testen her
// holder fast i, at det er parseren, der tæller, og at den tæller PRÆCIST:
// linje og kolonne skal matche det, Reacts _debugSource skriver (1-indekseret
// kolonne), ellers krediteres ingenting, og alt står som utestet.
import { describe, it, expect } from 'vitest';
import { scanKilde, haendelserFor, scanTrae } from './scan-flade.mjs';
import { noegle } from './lib/evneNoegle.mjs';

const KILDE = `import { Link } from 'react-router-dom';
// <button>i en kommentar</button>
export default function X({ onSend }) {
  const s = '<button>i en streng</button>';
  return (
    <form onSubmit={onSend}>
      <button
        type="submit"
        className="btn"
      >
        Send  besked
      </button>
      <input type="hidden" name="skjult" />
      <input type="checkbox" aria-label="Husk mig" />
      <textarea placeholder="Skriv her" />
      <select name="hold"><option>A</option></select>
      <a href="/hjaelp">Hjælp</a>
      <a>ikke et link</a>
      <Link to="/spil">Spil</Link>
      <div onClick={() => {}}>klik-div</div>
      <FacitInput onChange={() => {}} />
      <span>{s}</span>
    </form>
  );
}
`;

describe('scanKilde', () => {
  const poster = scanKilde(KILDE, 'src/X.jsx');
  const tags = poster.map((p) => `${p.tag}@${p.linje}`);

  it('finder flerlinje-knappen præcis én gang — ikke den i kommentaren eller strengen', () => {
    expect(poster.filter((p) => p.tag === 'button')).toHaveLength(1);
    const knap = poster.find((p) => p.tag === 'button');
    // Linje 7, kolonne 7 (0-indekseret 6) — samme tal, som React ville skrive.
    expect(knap.linje).toBe(7);
    expect(knap.kolonne).toBe(7);
    expect(knap.noegle).toBe(noegle('src/X.jsx', 7, 7));
    expect(knap.tekst).toBe('Send besked');
    expect(knap.komponent).toBe('X');
    expect(knap.haendelser).toEqual(['click']);
  });

  it('tæller form, felter, links og lowercase-elementer med handler — men ikke hidden, tomme <a> eller egne komponenter', () => {
    expect(tags).toEqual([
      'form@6', 'button@7', 'input@14', 'textarea@15', 'select@16', 'a@17', 'Link@19', 'div@20',
    ]);
    expect(poster.find((p) => p.tag === 'form').haendelser).toEqual(['submit']);
    expect(poster.find((p) => p.tag === 'input').haendelser).toEqual(['change', 'click']);
    expect(poster.find((p) => p.tag === 'input').tekst).toBe('Husk mig');
    expect(poster.find((p) => p.tag === 'textarea').tekst).toBe('Skriv her');
    expect(poster.find((p) => p.tag === 'Link').haendelser).toEqual(['click']);
    expect(poster.find((p) => p.tag === 'div').tekst).toBe('klik-div');
  });

  it('finder komponentnavnet også for pilefunktioner, og foretrækker komponenten frem for en indre hjælper', () => {
    const k = `const Kort = () => {
  const klik = () => <button aria-label="Inde i hjælper">x</button>;
  return <div>{klik()}<input placeholder="Ude i Kort" /></div>;
};`;
    const p = scanKilde(k, 'src/K.jsx');
    expect(p.map((x) => [x.tekst, x.komponent])).toEqual([['Inde i hjælper', 'Kort'], ['Ude i Kort', 'Kort']]);
  });

  it('foretrækker det oplæste navn og teksten på knappen frem for data-testid', () => {
    const p = scanKilde('const A = () => <button data-testid="gem-knap">Gem</button>;', 'src/A.jsx');
    expect(p[0].tekst).toBe('Gem');
    const q = scanKilde('const A = () => <button data-testid="gem-knap">{t}</button>;', 'src/A.jsx');
    expect(q[0].tekst).toBe('gem-knap');
  });

  it('kaster ved en fil, der ikke kan parses, i stedet for at tælle nul tavst', () => {
    expect(() => scanKilde('export default function X() { return <button', 'src/Y.jsx')).toThrow(/src\/Y\.jsx/);
  });
});

describe('haendelserFor', () => {
  it('tekstfelter aktiveres af input/change, checkbox også af klik, form kun af submit', () => {
    expect(haendelserFor('input', 'text', [])).toEqual(['change', 'input']);
    expect(haendelserFor('input', 'radio', [])).toEqual(['change', 'click']);
    expect(haendelserFor('form', null, [])).toEqual(['submit']);
    expect(haendelserFor('span', null, ['onClick', 'onChange'])).toEqual(['change', 'click', 'input']);
  });
});

describe('scanTrae mod det rigtige repo', () => {
  it('finder de knapper, der har været produktionsfejl i, og springer testfiler over', () => {
    const inv = scanTrae();
    const filer = new Set(inv.map((p) => p.fil));
    expect([...filer].some((f) => /\.test\.jsx?$/.test(f))).toBe(false);
    expect(inv.some((p) => p.fil === 'src/pages/GamePage.jsx' && p.tag === 'button')).toBe(true);
    // 1X2-knapperne i tip-fladen — den knap, hele spillet står på.
    expect(inv.some((p) => p.fil === 'src/features/games/football/FootballTip.jsx' && p.tag === 'button' && p.tekst == null && p.haendelser.includes('click'))).toBe(true);
    // Størrelsesorden: under 300 ville betyde, at scanneren er faldet tilbage
    // til noget, der ligner grep (131 knapper), over 1000 at tests er talt med.
    expect(inv.length).toBeGreaterThan(300);
    expect(inv.length).toBeLessThan(1000);
  });
});
