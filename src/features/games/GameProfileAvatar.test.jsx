// ---------------------------------------------------------------------------
// AVATAREN PÅ "MIT HOLD" VISTE "?" FOR HVER ENESTE SPILLER.
//
// `GameProfile` fik `name={me?.displayName}` og `emoji={me?.avatarEmoji}`, men
// `me` er `games/{id}/players/{uid}` — spiller-dokumentet, som kun rummer
// `favoriteTeam`. Intet sted i koden skriver et navn dertil, og
// `gameStandings.js` henter da også navnene fra en SEPARAT users-tabel.
//
// Begge felter var altså altid `undefined`. `initials('')` giver `'?'`, så
// kortet viste et spørgsmålstegn på en cirkel, hvis farve er en hash af uid'et
// — og en valgt avatar-emoji dukkede aldrig op. Ens egen profil var det ene
// sted i spillet, hvor man ikke kunne se sig selv.
//
// Fejlen var usynlig for alle tests, fordi de kaldte `<GameProfile me={{}} />`
// og aldrig så på avataren. Den her fil ser på den.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  onSnapshot: (_ref, cb) => { cb({ exists: () => false, data: () => null }); return () => {}; },
}));
vi.mock('./gameActions', () => ({ setPlayerFavoriteTeam: vi.fn() }));

const auth = { user: { uid: 'A' }, profile: null };
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));

const { default: GameProfile } = await import('./GameProfile');

const SPIL = {
  id: 'superliga2627',
  name: 'Superligaen',
  // `type` SKAL stå: trøjeoversigten nedenfor er gated på fodbold, og uden
  // feltet ville testen bevise, at den er væk — af den forkerte grund.
  type: 'football',
  teams: [
    { name: 'Lyngby Boldklub', short: 'LBK', elo: 1413, color: '#022592' },
    { name: 'Brøndby IF', short: 'BIF', elo: 1581, color: '#E5B905' },
  ],
};

/** Avatarens tekst — initialerne eller emojien, ikke trøje-badgen. */
function avatartekst() {
  // Avatar er den første <span> med border-radius 50 %; ClubBadge er en <svg>.
  const kugler = [...document.querySelectorAll('span')]
    .filter((e) => e.style.borderRadius === '50%');
  return kugler.map((e) => e.textContent);
}

describe('avataren på spilprofilen', () => {
  it('viser initialerne fra users-profilen, ikke "?"', () => {
    auth.profile = { displayName: 'Bo Bibamus' };
    render(<GameProfile game={SPIL} me={{ favoriteTeam: 'Lyngby Boldklub' }} />);
    expect(avatartekst()).toContain('BB');
    // BÆRENDE: det var præcis "?" der stod, og det må det ikke igen.
    expect(avatartekst()).not.toContain('?');
  });

  it('viser den valgte avatar-emoji', () => {
    auth.profile = { displayName: 'Bo Bibamus', avatarEmoji: '🦊' };
    render(<GameProfile game={SPIL} me={{ favoriteTeam: 'Lyngby Boldklub' }} />);
    expect(avatartekst()).toContain('🦊');
  });

  // MODPRØVEN PÅ KILDEN. Lægger man navnet på SPILLER-dokumentet — dér, hvor
  // koden læste før — må det IKKE dukke op. Uden den her ville en rettelse,
  // der læste begge steder, bestå, og så var fejlen ikke forstået.
  it('læser ikke navnet fra spiller-dokumentet', () => {
    auth.profile = null;
    render(<GameProfile game={SPIL} me={{ displayName: 'Fra Spillerdok', avatarEmoji: '🐙' }} />);
    expect(avatartekst()).not.toContain('FS');
    expect(avatartekst()).not.toContain('🐙');
  });

  // …og falder tilbage på auth-brugerens navn, hvis users-dokumentet ikke er
  // hentet endnu. Ellers blinker "?" ved hver indlæsning.
  it('falder tilbage på auth-brugerens navn', () => {
    auth.profile = null;
    auth.user = { uid: 'A', displayName: 'Auth Navn' };
    render(<GameProfile game={SPIL} me={{}} />);
    expect(avatartekst()).toContain('AN');
    auth.user = { uid: 'A' };
  });

  // Trøje-badgen ved siden af er en anden ting og skal blive stående.
  it('viser stadig holdets trøje ved siden af navnet', () => {
    auth.profile = { displayName: 'Bo Bibamus' };
    render(<GameProfile game={SPIL} me={{ favoriteTeam: 'Lyngby Boldklub' }} />);
    expect(screen.getByLabelText('Lyngby Boldklub')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// TRØJEOVERSIGTEN STÅR PÅ SKÆRMEN.
//
// Uden den her test kunne <TroejeOversigt /> fjernes helt fra GameProfile med
// alle 2155 tests grønne. Komponentens egne 33 tests renderer den DIREKTE og
// beviser derfor intet om, hvorvidt den er koblet på nogen flade — præcis den
// fejl, `recomputeSeasonElo` havde: maskineri, ingen kunne komme til.
// ---------------------------------------------------------------------------
describe('trøjeoversigten på Mit hold', () => {
  it('står på kortet', () => {
    auth.profile = { displayName: 'Bo Bibamus' };
    const { container } = render(<GameProfile game={SPIL} me={{}} />);
    expect(container.querySelector('.troejer')).not.toBeNull();
    // …og den viser spillets hold, ikke bare en tom ramme.
    expect(container.querySelectorAll('.troejer__hold')).toHaveLength(SPIL.teams.length);
  });

  it('står IKKE på et spil uden fodbold', () => {
    auth.profile = { displayName: 'Bo Bibamus' };
    const { container } = render(<GameProfile game={{ ...SPIL, type: 'tour' }} me={{}} />);
    expect(container.querySelector('.troejer')).toBeNull();
  });
});
