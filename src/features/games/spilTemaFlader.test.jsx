// ---------------------------------------------------------------------------
// NÅR TEMAET ER REGNET UD — KOMMER DET SÅ UD PÅ SKÆRMEN?
//
// `accentTema.test.js` beviser, at farverne er rigtige. Den beviser INTET om,
// at nogen bruger dem. Fjernede man `useSpilTema` fra GameLayout, ville alle
// tal i den fil stadig passe, og siden ville være grøn — nøjagtig samme fejl
// som `recomputeSeasonElo`, der var maskineri, ingen kunne komme til, og som
// trøjeoversigten, der kunne hægtes af GameProfile med 2155 grønne tests.
//
// Den her fil er listen over, HVOR temaet skal virke, og hvornår det IKKE må.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { accentTema } from '../../lib/accentTema';
import { klubAccentAf } from './football/badges';
import { useSpilTema } from './useSpilTema';
import GameLayout from './GameLayout';

const HOLD = [
  { name: 'Brøndby IF', short: 'BIF', color: '#E5B905', awayColor: '#122859', thirdColor: '#2E2926' },
  // FCK: hjemmetrøjen er HVID. Klubfarven skal derfor komme fra udetrøjen.
  { name: 'F.C. København', short: 'FCK', color: '#FFFFFF', awayColor: '#0A2240', thirdColor: '#76CABF' },
  // Et hold uden kulør i nogen af de tre — som Crystal Palace i PL-listen.
  { name: 'Gråt BK', short: 'GBK', color: '#FEFEFE', awayColor: '#1B1B1B', thirdColor: '#FFFFFF' },
];
const SPIL = { id: 'sl', type: 'football', name: 'Superligaen', teams: HOLD };

function tegn(game, me) {
  return render(
    <MemoryRouter><GameLayout game={game} me={me}><p>indhold</p></GameLayout></MemoryRouter>,
  );
}

/** Spillets ramme — den container, variablerne sættes på. */
function ramme(container) {
  return container.querySelector('[data-klubtema]');
}

beforeEach(() => document.documentElement.setAttribute('data-theme', 'light'));
afterEach(() => { cleanup(); document.documentElement.removeAttribute('data-theme'); });

describe('klubAccentAf', () => {
  it('tager hjemmetrøjen, når den har kulør', () => {
    expect(klubAccentAf(HOLD, {}, 'Brøndby IF')).toBe('#E5B905');
  });

  // BÆRENDE. Ringen om avataren bruger TRØJEfarven og skal sige hvid om FCK;
  // temaet skal sige marineblå. To spørgsmål, to funktioner, samme fil.
  it('springer den hvide hjemmetrøje over og tager udetrøjen', () => {
    expect(klubAccentAf(HOLD, {}, 'F.C. København')).toBe('#0A2240');
  });

  it('giver null, når ingen af de tre trøjer bærer kulør', () => {
    expect(klubAccentAf(HOLD, {}, 'Gråt BK')).toBeNull();
  });

  it('giver null for et navn, spillet ikke kender', () => {
    // `gameStandings.js` falder tilbage på brugerens GLOBALE yndlingshold, og
    // for en migreret Tour-bruger står der et cykelhold dér.
    expect(klubAccentAf(HOLD, {}, 'Team Visma | Lease a Bike')).toBeNull();
    expect(klubAccentAf(HOLD, {}, null)).toBeNull();
  });

  it('følger ejerens farve-override', () => {
    // `teamStyles` er det ENESTE sted, en håndrettet farve findes. Læste temaet
    // rådata i stedet, ville ejerens rettelse gælde på kampkortet og ikke her.
    const styles = { 'Brøndby IF': { color: '#B80112' } };
    expect(klubAccentAf(HOLD, styles, 'Brøndby IF')).toBe('#B80112');
  });

  it('lader en override GØRE en hvid trøje brugbar', () => {
    const styles = { 'F.C. København': { color: '#0A2240' } };
    expect(klubAccentAf(HOLD, styles, 'F.C. København')).toBe('#0A2240');
  });
});

describe('spillets ramme bærer temaet', () => {
  it('sætter alle fem variabler på containeren', () => {
    const { container } = tegn(SPIL, { favoriteTeam: 'Brøndby IF' });
    const forventet = accentTema('#E5B905', 'lyst');
    const stil = ramme(container).style;
    expect(stil.getPropertyValue('--c-pitch')).toBe(forventet.pitch);
    expect(stil.getPropertyValue('--c-pitch-dark')).toBe(forventet.pitchDark);
    expect(stil.getPropertyValue('--c-on-pitch')).toBe(forventet.onPitch);
    expect(stil.getPropertyValue('--c-pitch-weak')).toBe(forventet.pitchWeak);
    expect(stil.getPropertyValue('--c-pitch-tint')).toBe(forventet.pitchTint);
    // …og det er den DYBE gule, ikke den rå. Stod den rå her, ville hver eneste
    // tekst i spillet ligge på 1,86:1.
    expect(stil.getPropertyValue('--c-pitch')).toBe('#8b7003');
    expect(stil.getPropertyValue('--c-pitch')).not.toBe('#E5B905');
  });

  it('mærker rammen med holdets navn', () => {
    const { container } = tegn(SPIL, { favoriteTeam: 'Brøndby IF' });
    expect(ramme(container).getAttribute('data-klubtema')).toBe('Brøndby IF');
  });

  it('lader indholdet ligge INDE i rammen, så variablerne nedarves', () => {
    // Sad temaet på en søskende i stedet, ville intet af spillet arve det.
    const { container, getByText } = tegn(SPIL, { favoriteTeam: 'Brøndby IF' });
    expect(ramme(container).contains(getByText('indhold'))).toBe(true);
  });

  it('bruger udetrøjens farve for et hold i hvidt', () => {
    const { container } = tegn(SPIL, { favoriteTeam: 'F.C. København' });
    expect(ramme(container).style.getPropertyValue('--c-pitch'))
      .toBe(accentTema('#0A2240', 'lyst').pitch);
  });
});

describe('spillets ramme bærer IKKE et tema', () => {
  const uden = (game, me) => {
    const { container } = tegn(game, me);
    expect(ramme(container)).toBeNull();
    // …og rammen må ikke have fået et HALVT tema med. Kun rammens EGEN
    // style-attribut ses efter: teksten `var(--c-pitch)` står i indholdet
    // nedenunder, og det er netop meningen — den skal arve app-grøn.
    expect(container.firstChild.getAttribute('style')).toBeNull();
  };

  it('når spilleren ikke har valgt et hold', () => uden(SPIL, {}));
  it('når spilleren slet ikke er med', () => uden(SPIL, null));
  it('når holdet ikke er i spillets liste', () => uden(SPIL, { favoriteTeam: 'Team Visma | Lease a Bike' }));
  it('når ingen af holdets trøjer har kulør', () => uden(SPIL, { favoriteTeam: 'Gråt BK' }));

  // BÆRENDE GATE. `teamsOf` falder tilbage på Superligaens tolv hold, når
  // spillet ikke har sin egen liste. Uden fodbold-gaten kunne en Tour-spiller
  // få Brøndby-gult tema, fordi hans cykelhold tilfældigvis matchede et navn.
  it('på et spil, der ikke er fodbold', () => {
    uden({ ...SPIL, type: 'tour' }, { favoriteTeam: 'Brøndby IF' });
  });
});

describe('temaet følger basistemaet', () => {
  it('regner om, når brugeren slår over til mørkt', async () => {
    const { result } = renderHook(() => useSpilTema(SPIL, { favoriteTeam: 'Brøndby IF' }));
    expect(result.current.stil['--c-pitch']).toBe(accentTema('#E5B905', 'lyst').pitch);

    // MutationObserver leverer i en mikrotask, så act'en skal være async.
    await act(async () => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    // BÆRENDE: uden lytteren stod den lyse udledning tilbage på en mørk side —
    // altså #8b7003 (dyb okker) på næsten sort: 2,05:1. Den mørke udledning er
    // den rå gule, som giver 7,82:1 på egen-rækken.
    expect(result.current.stil['--c-pitch']).toBe('#e5b905');
    expect(result.current.stil['--c-on-pitch']).toBe('#10151b');
  });

  it('giver forskellige farver i de to basistemaer', () => {
    expect(accentTema('#E5B905', 'lyst').pitch).not.toBe(accentTema('#E5B905', 'moerkt').pitch);
  });
});

describe('to spil ved siden af hinanden', () => {
  it('får hver sin farve — temaet er ikke globalt', () => {
    // Det var Tours fejl: ét hold, gemt i localStorage, hele appen. Her hører
    // yndlingsholdet til SPILLET (games/{id}/players/{uid}.favoriteTeam).
    const a = tegn(SPIL, { favoriteTeam: 'Brøndby IF' });
    const b = tegn({ ...SPIL, id: 'pl' }, { favoriteTeam: 'F.C. København' });
    expect(ramme(a.container).style.getPropertyValue('--c-pitch'))
      .not.toBe(ramme(b.container).style.getPropertyValue('--c-pitch'));
    // …og der er intet sat på <html>, som ville følge med til det andet spil.
    expect(document.documentElement.style.getPropertyValue('--c-pitch')).toBe('');
  });
});

describe('topbjælken bliver udenfor', () => {
  it('det aktive nav-link henter sit blæk fra fladen', async () => {
    // Layout.jsx hardkodede '#fff'. I Tour gav det visma 1,28:1, pinarello
    // 2,45, jayco 2,65 og astana 3,06 — det aktive link var det sværest
    // læselige på hele siden.
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const her = dirname(fileURLToPath(import.meta.url));
    const kode = readFileSync(resolve(her, '../../components/Layout.jsx'), 'utf8');
    expect(kode).toMatch(/color: isActive \? 'var\(--c-on-pitch\)'/);
    expect(kode).not.toMatch(/color: isActive \? '#fff'/);
  });
});

// ---------------------------------------------------------------------------
// OG SÅ SKAL DER STÅ DET RIGTIGE OM DET.
//
// Teksten på "Mit hold" lovede før kun en ring. Nu sker der to ting, og de
// bruger med vilje TO FORSKELLIGE farver af samme hold — ringen tager trøjen,
// temaet tager klubfarven. Står der kun det ene, ligner det andet en fejl.
// (Sætningen kunne før erstattes med "OK?" med grøn suite. Derfor assertéres
// der på indholdet — og på det, der IKKE må stå.)
// ---------------------------------------------------------------------------
vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  onSnapshot: (_ref, cb) => { cb({ exists: () => false, data: () => null }); return () => {}; },
}));
vi.mock('./gameActions', () => ({ setPlayerFavoriteTeam: vi.fn() }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'A' }, profile: { displayName: 'Bo B' } }) }));

const { default: GameProfile } = await import('./GameProfile');

describe('teksten på Mit hold', () => {
  const brød = () => render(<GameProfile game={SPIL} me={{}} />)
    .container.querySelector('.card > p').textContent.replace(/\s+/g, ' ');

  it('nævner BÅDE ringen og tonen på siden', () => {
    const t = brød();
    expect(t).toMatch(/trøjens farve som ring/);
    expect(t).toMatch(/klubbens farve/);
  });

  it('siger at det kun gælder dette spil', () => {
    // Temaet sidder på spillets container netop for ikke at følge med ud.
    // Lovede teksten noget andet, ville valget se ud som om det ikke virkede.
    expect(brød()).toMatch(/kun her/);
    expect(brød()).toMatch(/resten af siden bliver grøn/);
  });

  it('lover ikke længere, at RINGEN er klubbens farve', () => {
    // Den gamle formulering ("holdets farve som ring") gjorde de to farver til
    // én — og så ville FCK's hvide ring og marineblå tema modsige hinanden.
    expect(brød()).not.toMatch(/holdets farve som ring/);
  });
});
