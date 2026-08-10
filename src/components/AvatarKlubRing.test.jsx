// ---------------------------------------------------------------------------
// KLUBRINGEN OM AVATAREN.
//
// Yndlingsholdet gjorde INTET synligt på platformen: `Avatar` brugte kun
// `favoriteTeam` til et Tour-cykelholds trøjebillede, og den kode er slået fra,
// når PLATFORM_MODE er sat. Alligevel lovede spilprofilen ordret, at valget
// "giver din avatar holdets farve i stillingen og i dine ligaer".
//
// RINGEN, IKKE FYLDET — og det er dét, testene her holder fast i. Fyldet er
// `avatarColor(uid)`, og det er den, der skiller spillerne fra hinanden i
// stillingen. Blev holdfarven fyldet, ville fem FCK-fans stå som fem ens hvide
// cirkler.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Avatar from './Avatar';
import { avatarColor } from '../features/profile/avatarUtils';

/** Den ydre boks og den indre cirkel. */
function dele(container) {
  const ydre = container.firstChild;
  return { ydre, cirkel: ydre.firstChild };
}
const tal = (px) => Number(String(px).replace('px', ''));

/** Ringlagene som [spredning i px, farve], yderst sidst. */
function lag(cirkel) {
  const s = cirkel.style.boxShadow;
  if (!s) return [];
  return s.split(/,(?![^(]*\))/).map((d) => {
    const m = d.trim().match(/0(?:px)? 0(?:px)? 0(?:px)? ([\d.]+)px (.+)$/);
    return m ? [Number(m[1]), m[2].trim()] : null;
  }).filter(Boolean);
}

const BROENDBY = { primaer: '#E5B905', sekundaer: null, navn: 'Brøndby' };
const RANDERS = { primaer: '#78C5ED', sekundaer: '#30374F', navn: 'Randers FC' };

describe('avatar uden klubfarver', () => {
  // BÆRENDE: hver avatar i hele appen ville blive mindre, hvis ring-regnestykket
  // ikke havde en eksplicit nul-gren. `indre + ringBredde + 1` giver 1 selv
  // uden ring.
  it('fylder hele størrelsen ud og har ingen ring', () => {
    const { cirkel, ydre } = dele(render(<Avatar uid="a" name="Bo Bibamus" size={26} />).container);
    expect(tal(cirkel.style.width)).toBe(26);
    expect(tal(ydre.style.width)).toBe(26);
    expect(lag(cirkel)).toEqual([]);
  });

  it('beholder den personlige hash-farve som fyld', () => {
    const { cirkel } = dele(render(<Avatar uid="abc" name="Bo" size={26} />).container);
    expect(cirkel.style.background).toBeTruthy();
    expect(avatarColor('abc')).toMatch(/^#/);
  });
});

describe('avatar med klubfarver', () => {
  it('lægger holdets farve som RING, ikke som fyld', () => {
    const { cirkel } = dele(
      render(<Avatar uid="abc" name="Bo" klubFarver={BROENDBY} size={26} />).container,
    );
    const farver = lag(cirkel).map(([, f]) => f.toLowerCase());
    expect(farver.some((f) => f.includes('229, 185, 5') || f.includes('e5b905'))).toBe(true);
    // MODPRØVEN: fyldet må IKKE være holdfarven. Det er hele forskellen på
    // "fem FCK-fans kan skelnes" og "fem ens hvide cirkler".
    expect(cirkel.style.background.toLowerCase()).not.toContain('229, 185, 5');
    expect(cirkel.style.background.toLowerCase()).not.toContain('e5b905');
  });

  // Ringen må ikke vokse ud over `size` — så ville rækken i stillingen skubbe
  // sig, og avataren ville overlappe navnet ved siden af.
  it.each([22, 26, 34, 44, 48])('holder sig inden for size=%i', (size) => {
    const { cirkel, ydre } = dele(
      render(<Avatar uid="a" name="Bo" klubFarver={RANDERS} size={size} />).container,
    );
    const yderst = Math.max(...lag(cirkel).map(([s]) => s));
    expect(tal(cirkel.style.width) + 2 * yderst).toBe(size);
    expect(tal(ydre.style.width)).toBe(size);
  });

  // RINGEN SKAL KUNNE SES VED 22 px — den mindste, der bruges (ligatabellen).
  // 1 px forsvinder på en 1×-skærm.
  it('giver ringen mindst 2 px, også ved 22', () => {
    const { cirkel } = dele(
      render(<Avatar uid="a" name="Bo" klubFarver={BROENDBY} size={22} />).container,
    );
    const l = lag(cirkel);
    // Uden sekundærfarve: [primær, hårlinje]. Primærringens egen bredde er
    // dens spredning, da der intet ligger indenfor.
    expect(l).toHaveLength(2);
    expect(l[0][0]).toBeGreaterThanOrEqual(2);
  });

  it('lægger sekundærfarven INDEN FOR primærfarven', () => {
    const { cirkel } = dele(
      render(<Avatar uid="a" name="Bo" klubFarver={RANDERS} size={44} />).container,
    );
    const l = lag(cirkel);
    expect(l).toHaveLength(3);
    // Lagene ligger indefra og ud, så spredningen skal vokse.
    expect(l[0][0]).toBeLessThan(l[1][0]);
    expect(l[1][0]).toBeLessThan(l[2][0]);
    // …og det inderste er sekundærfarven.
    expect(l[0][1].toLowerCase()).toMatch(/48, 55, 79|30374f/);
  });

  it('springer sekundærlaget over, når holdet kun har én farve', () => {
    const { cirkel } = dele(
      render(<Avatar uid="a" name="Bo" klubFarver={BROENDBY} size={44} />).container,
    );
    expect(lag(cirkel)).toHaveLength(2);
  });

  it('navngiver holdet, så man kan se hvad ringen betyder', () => {
    const { ydre } = dele(
      render(<Avatar uid="a" name="Bo" klubFarver={RANDERS} size={26} />).container,
    );
    expect(ydre.getAttribute('title')).toBe('Randers FC');
  });
});

// ---------------------------------------------------------------------------
// HÅRLINJEN SKAL VENDE MODSAT AF RINGEN.
//
// Første udgave var altid mørk. Det løser den ene halvdel: FCK, AGF og
// Silkeborg spiller i hvidt, og en hvid ring på en hvid tabelrække er ingen
// ring. Den anden halvdel dukkede op i renderen — Midtjyllands SORTE ring
// forsvandt i mørkt tema ved 22 og 26 px, fordi ring og hårlinje begge var
// mørke som baggrunden.
// ---------------------------------------------------------------------------
describe('hårlinjen yderst', () => {
  const yderste = (farver) => {
    const { cirkel } = dele(
      render(<Avatar uid="a" name="Bo" klubFarver={farver} size={34} />).container,
    );
    const l = lag(cirkel);
    return l[l.length - 1][1];
  };

  it('er mørk om en LYS ring — ellers forsvinder hvid på hvid', () => {
    expect(yderste({ primaer: '#FFFFFF', sekundaer: null, navn: 'FCK' })).toMatch(/rgba\(0, ?0, ?0/);
  });

  it('er lys om en MØRK ring — ellers forsvinder sort i mørkt tema', () => {
    expect(yderste({ primaer: '#0B0807', sekundaer: null, navn: 'FCM' }))
      .toMatch(/rgba\(255, ?255, ?255/);
  });

  // MODPRØVEN PÅ SELVE REGLEN: de to skal give FORSKELLIGT svar. En hårlinje,
  // der var konstant, ville bestå begge de to tests ovenfor, hvis den blot var
  // valgt rigtigt for den ene — og det var netop fejlen.
  it('giver forskellig hårlinje for hvid og sort', () => {
    expect(yderste({ primaer: '#FFFFFF', sekundaer: null, navn: 'a' }))
      .not.toBe(yderste({ primaer: '#0B0807', sekundaer: null, navn: 'b' }));
  });
});
