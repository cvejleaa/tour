import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../firebase', () => ({ db: {} }));

// getDocs er styrbar pr. test: en liste = svaret, en Error = afvist af reglen.
const mockSvar = { current: [] };
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  getDocs: async () => {
    if (mockSvar.current instanceof Error) throw mockSvar.current;
    return { docs: mockSvar.current.map((b) => ({ id: b.uid, data: () => b })) };
  },
}));

// Liga-fæller med navne (liga-afgrænset, som i stillingen) + seerens ligaer.
const mockStand = { current: { standings: [], leagues: [] } };
vi.mock('../useGameStandings', () => ({
  useGameStandings: () => ({ ...mockStand.current, loading: false, error: null }),
}));
vi.mock('../../../components/ClubBadge', () => ({ default: () => null }));

import PuljeAfsloering, { enegaengerTekst, ENEGAENGER_MINIMUM } from './PuljeAfsloering';

const TEAMS = ['A', 'B', 'C', 'D', 'E'].map((n) => ({ name: n, short: n }));
const KONFIG = { poolSize: 3, perTeam: 4, perfectBonus: 10 };
const LIGA = { id: 'k', name: 'Kontoret', memberUids: ['me', 'u2', 'u3'] };
const STAND = [
  { uid: 'me', name: 'Mig' }, { uid: 'u2', name: 'Bo' }, { uid: 'u3', name: 'Carla' },
];
const BETS = [
  { uid: 'me', championship: ['A', 'B', 'C'] },
  { uid: 'u2', championship: ['A', 'B', 'D'] },
  { uid: 'u9', championship: ['A', 'E', 'D'] },   // i spillet, ikke i ligaen
];
const props = (over = {}) => ({
  gameId: 'g', uid: 'me', teams: TEAMS, konfig: KONFIG,
  facitTop: null, ligeNuTop: new Set(['A', 'B', 'C']), ...over,
});

beforeEach(() => {
  mockSvar.current = BETS;
  mockStand.current = { standings: STAND, leagues: [LIGA] };
});

describe('PuljeAfsloering — hold-tabellen (hele spillet, ingen navne)', () => {
  it('tæller pr. hold på HELE spillet, også dem uden for ligaen', async () => {
    render(<PuljeAfsloering {...props()} />);
    const tabel = await screen.findByTestId('pulje-holdtabel');
    // A: alle 3 · B: 2 · D: 2 · C: 1 · E: 1 — u9 tæller med, selv om han
    // ikke er liga-fælle.
    expect(tabel).toHaveTextContent('3 af 3');
    expect(tabel.textContent).toMatch(/A.*3 af 3/);
    expect(tabel.textContent).toMatch(/E.*1 af 3/);
  });

  it('markerer holdene, der står der lige nu, med 🏆', async () => {
    render(<PuljeAfsloering {...props()} />);
    const tabel = await screen.findByTestId('pulje-holdtabel');
    const raekker = [...tabel.querySelectorAll('tr')].map((r) => r.textContent.trim());
    expect(raekker.find((r) => r.startsWith('A'))).toContain('🏆');
    expect(raekker.find((r) => r.startsWith('D'))).not.toContain('🏆');
  });

  it('enegængeren nævnes ved navn KUN når han er liga-fælle — ellers "kun én spiller"', async () => {
    render(<PuljeAfsloering {...props()} />);
    const tabel = await screen.findByTestId('pulje-holdtabel');
    const raekker = [...tabel.querySelectorAll('tr')].map((r) => r.textContent.trim());
    // C: kun mig → "kun dig". E: kun u9, som IKKE er liga-fælle → intet navn.
    expect(raekker.find((r) => r.startsWith('C'))).toContain('kun dig');
    expect(raekker.find((r) => r.startsWith('E'))).toContain('kun én spiller');
    expect(raekker.find((r) => r.startsWith('E'))).not.toMatch(/u9/);
  });

  it('under ENEGAENGER_MINIMUM tip kaldes ingen enegænger — to tip er en mønt', async () => {
    mockSvar.current = BETS.slice(0, 2);
    expect(BETS.slice(0, 2).length).toBeLessThan(ENEGAENGER_MINIMUM);
    render(<PuljeAfsloering {...props()} />);
    const tabel = await screen.findByTestId('pulje-holdtabel');
    expect(tabel.textContent).not.toContain('kun ');
  });

  it('siger ÆRLIGT, at puljen er åben for hele spillet — ikke "kun din liga"', async () => {
    render(<PuljeAfsloering {...props()} />);
    await screen.findByTestId('pulje-afsloering');
    expect(screen.getByText(/åben for alle i spillet/)).toBeInTheDocument();
    expect(screen.queryByText(/kun din liga/)).toBeNull();
  });
});

describe('PuljeAfsloering — ranglisten (én liga ad gangen)', () => {
  it('rangerer KUN ligaens medlemmer — u9 er i spillet, men ikke på listen', async () => {
    render(<PuljeAfsloering {...props()} />);
    const liste = await screen.findByTestId('pulje-rangliste');
    expect(liste.textContent).toContain('du');
    expect(liste.textContent).toContain('Bo');
    expect(liste.textContent).not.toContain('u9');
  });

  it('"tippede ikke" står SÆRSKILT og sidst — ikke som 0 af 3', async () => {
    render(<PuljeAfsloering {...props()} />);
    const liste = await screen.findByTestId('pulje-rangliste');
    const punkter = [...liste.querySelectorAll('li')].map((l) => l.textContent);
    expect(punkter[punkter.length - 1]).toContain('Carla');
    expect(punkter[punkter.length - 1]).toContain('tippede ikke');
    expect(punkter[punkter.length - 1]).not.toContain('0 af 3');
  });

  it('viser IKKE ranglisten under to liga-fæller', async () => {
    mockStand.current = { standings: [STAND[0]], leagues: [{ ...LIGA, memberUids: ['me'] }] };
    render(<PuljeAfsloering {...props()} />);
    await screen.findByTestId('pulje-holdtabel');
    expect(screen.queryByTestId('pulje-rangliste')).toBeNull();
  });

  it('viser IKKE ranglisten uden ligaer — men hold-tabellen står stadig', async () => {
    mockStand.current = { standings: [STAND[0]], leagues: [] };
    render(<PuljeAfsloering {...props()} />);
    await screen.findByTestId('pulje-holdtabel');
    expect(screen.queryByTestId('pulje-rangliste')).toBeNull();
  });

  it('med flere ligaer: en vælger UDEN "alle mine ligaer", og listen følger valget', async () => {
    const FAM = { id: 'f', name: 'Familien', memberUids: ['me', 'u3'] };
    mockStand.current = { standings: STAND, leagues: [LIGA, FAM] };
    render(<PuljeAfsloering {...props()} />);
    const vaelger = await screen.findByRole('combobox', { name: 'Vis puljen for' });
    // En rangliste på unionen matcher INGEN ligas stilling — muligheden findes ikke.
    expect([...vaelger.options].map((o) => o.textContent)).toEqual(['Kontoret', 'Familien']);
    fireEvent.change(vaelger, { target: { value: 'f' } });
    await waitFor(() => {
      const liste = screen.getByTestId('pulje-rangliste');
      expect(liste.textContent).toContain('Carla');
      expect(liste.textContent).not.toContain('Bo');
    });
  });

  it('med ÉN liga er der ingen vælger — der er intet at vælge imellem', async () => {
    render(<PuljeAfsloering {...props()} />);
    await screen.findByTestId('pulje-rangliste');
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('"lige nu"-forbeholdet står, så længe puljen ikke er afgjort', async () => {
    render(<PuljeAfsloering {...props()} />);
    await screen.findByTestId('pulje-rangliste');
    expect(screen.getByText(/Intet er afgjort endnu/)).toBeInTheDocument();
    expect(screen.queryByTestId('pulje-vinder')).toBeNull();
  });
});

describe('PuljeAfsloering — sæsonslut, én kilde til tallet', () => {
  const AFGJORT = [
    { uid: 'me', championship: ['A', 'B', 'C'], correct: 3, points: 22 },
    { uid: 'u2', championship: ['A', 'B', 'D'], correct: 2, points: 8 },
    { uid: 'u9', championship: ['A', 'E', 'D'], correct: 1, points: 4 },
  ];

  it('bruger SERVERENS tal og kårer vinderen — med perfekt-bonus', async () => {
    mockSvar.current = AFGJORT;
    // facitTop er bevidst UENIG med serverens correct for u2 (klienten ville
    // give 3 af 3) — serveren skal vinde, ellers har vi to kilder.
    render(<PuljeAfsloering {...props({ facitTop: ['A', 'B', 'D'] })} />);
    const vinder = await screen.findByTestId('pulje-vinder');
    expect(vinder).toHaveTextContent('du');
    expect(vinder).toHaveTextContent('3 af 3');
    expect(vinder).toHaveTextContent('perfekt række');
    expect(vinder).toHaveTextContent('+10 bonus');
    const liste = screen.getByTestId('pulje-rangliste');
    expect(liste.textContent).toMatch(/Bo — 2 af 3/);   // serverens 2, ikke klientens 3
    expect(screen.queryByText(/Intet er afgjort endnu/)).toBeNull();
    // 🏆 FØLGER FACIT, ikke "lige nu": ligeNuTop har C, facitTop har D.
    const raekker = [...screen.getByTestId('pulje-holdtabel').querySelectorAll('tr')].map((r) => r.textContent.trim());
    expect(raekker.find((r) => r.startsWith('D'))).toContain('🏆');
    expect(raekker.find((r) => r.startsWith('C'))).not.toContain('🏆');
  });

  it('ét dokument uden correct → IKKE afgjort, "lige nu" for alle', async () => {
    mockSvar.current = [AFGJORT[0], { uid: 'u2', championship: ['A', 'B', 'D'] }];
    render(<PuljeAfsloering {...props()} />);
    await screen.findByTestId('pulje-rangliste');
    expect(screen.queryByTestId('pulje-vinder')).toBeNull();
    expect(screen.getByText(/Intet er afgjort endnu/)).toBeInTheDocument();
  });
});

describe('PuljeAfsloering — fejler stille', () => {
  it('permission-denied (fx et ur foran serverens) viser INGENTING — ingen rød alarm', async () => {
    mockSvar.current = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    const { container } = render(<PuljeAfsloering {...props()} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.textContent).toBe('');
    expect(screen.queryByTestId('pulje-afsloering')).toBeNull();
  });

  it('ingen tip endnu → ingenting', async () => {
    mockSvar.current = [];
    const { container } = render(<PuljeAfsloering {...props()} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.textContent).toBe('');
  });
});

describe('enegaengerTekst', () => {
  it('dig / navn / anonym', () => {
    const navnAf = (u) => ({ u2: 'Bo' }[u] || null);
    expect(enegaengerTekst('me', 'me', navnAf)).toBe('kun dig');
    expect(enegaengerTekst('u2', 'me', navnAf)).toBe('kun Bo');
    expect(enegaengerTekst('u9', 'me', navnAf)).toBe('kun én spiller');
    expect(enegaengerTekst(null, 'me', navnAf)).toBeNull();
  });
});
