// ---------------------------------------------------------------------------
// KAMPDETALJE-EVNEN SKAL FAKTISK GATE FLADERNE — ikke bare findes.
//
// Samme slags fil som `xgWiring.test.jsx`, og af samme grund: Test Manager
// slukkede dér hele wiringen (`{false && harXg(game) && …}`) og fik 2940
// grønne tests. En evne, ingen flade spørger om, er ikke en evne.
//
// Men denne fil har et fund MERE at forsvare, som xG ikke havde. Quality
// Control blokerede planen, fordi evnen var ved at blive gatet på
// FACIT-PROVIDEREN (`{'pulselige','superliga'}`). Livescore er en TREDJE,
// ortogonal kilde: den er den samme for begge spil, uanset hvor facit kommer
// fra. En provider-gate ville altså være en proxy for en korrelation, der kun
// tilfældigvis holder i dag — nøjagtig `puljeLockRound`-fejlen, hvor
// "Synk kamptider nu" manglede for Superligaen i månedsvis, fordi gaten
// testede en nabo-egenskab i stedet for evnen selv.
//
// Derfor er DET NEGATIVE TILFÆLDE her ikke "et spil uden kilde", men
// **et spil med SAMME facit-provider og UDEN livescore-kortlægning**. Kun
// dét kan skelne en ægte evne-gate fra en proxy-gate.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FootballHelp from './FootballHelp';
import { harKampdetaljer } from '../spilEvner';

vi.mock('../../../firebase', () => ({ db: {}, functions: {} }));

/** Spillene, evnen FAKTISK gælder for — spejlet af serveren, se spilEvner. */
const MED = { id: 'superliga2627', name: 'Superligaen', sync: { provider: 'superliga' } };
/** Samme facit-provider, INGEN livescore-kortlægning. Proxy-gate-fælden. */
const UDEN_MEN_SAMME_KILDE = { id: 'sl2728', name: 'Superligaen 27/28', sync: { provider: 'superliga' } };
const PL_MED = { id: 'pl2627-efteraar', name: 'PL efterår', sync: { provider: 'pulselive' } };
const PL_UDEN = { id: 'pl2728-foraar', name: 'PL forår', sync: { provider: 'pulselive' } };

const vis = (game) => render(
  <MemoryRouter initialEntries={['/spil/x?fane=hjaelp']}>
    <FootballHelp game={game} />
  </MemoryRouter>,
);

const OVERSKRIFT = /Halvleg, målscorere og tilskuertal/;

describe('guidens kampdetalje-afsnit', () => {
  it('STÅR der for et spil med livescore-kortlægning', () => {
    vis(MED);
    expect(screen.getByText(OVERSKRIFT)).toBeInTheDocument();
  });

  it('står der også for Premier League', () => {
    // Begge spil, ikke bare det ene: SL-synken fik serverdelen i én PR,
    // Drift-kortet i den næste og knappen i den tredje, fordi hver flade
    // først blev fundet, da nogen savnede den.
    vis(PL_MED);
    expect(screen.getByText(OVERSKRIFT)).toBeInTheDocument();
  });

  it('er VÆK for et spil med samme facit-kilde, men uden kortlægning', () => {
    // DET FUND, FILEN FINDES FOR. En gate på sync.provider ville vise
    // afsnittet her — en regelbog, der forklarer et tal, spillet aldrig får.
    vis(UDEN_MEN_SAMME_KILDE);
    expect(screen.queryByText(OVERSKRIFT)).toBeNull();
    vis(PL_UDEN);
    expect(screen.queryAllByText(OVERSKRIFT)).toHaveLength(0);
  });

  it('er VÆK for et spil helt uden kilde', () => {
    vis({ id: 'noget-andet', name: 'Andet spil' });
    expect(screen.queryByText(OVERSKRIFT)).toBeNull();
  });

  it('teksten lover ikke point for halvlegen', () => {
    // Spilførers grænse: appen må vise kampfakta neutralt, men aldrig
    // antyde et skyggepoint-system, spillet ikke udbetaler. En test, der kun
    // tjekker at afsnittet blev VIST, ville overleve at teksten sagde det
    // modsatte.
    const { container } = vis(MED);
    const tekst = container.textContent;
    expect(tekst).toMatch(/Point følger slutresultatet og kun det/);
    expect(tekst).toMatch(/ingen point for at have ført ved pausen/);
  });
});

describe('gaten selv', () => {
  it('skelner to spil med samme provider', () => {
    // Prædikatet, alle fladerne gater på. Holder denne, kan en flade kun
    // fejle ved at bruge et ANDET prædikat — og dét er, hvad testene ovenfor
    // og spilEvner.test.js' spejling mod serveren fanger.
    expect(harKampdetaljer(MED)).toBe(true);
    expect(harKampdetaljer(UDEN_MEN_SAMME_KILDE)).toBe(false);
    expect(harKampdetaljer(PL_MED)).toBe(true);
    expect(harKampdetaljer(PL_UDEN)).toBe(false);
  });
});
