import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../firebase', () => ({ db: {} }));

// getDocs er styrbar pr. test: en liste = svaret, en Error = afvist af reglen.
// Dokument-id'et er `id`, når fixturen har et — ellers `uid`. Det gør det
// muligt at give et dokument, hvis DATA-uid strider mod id'et.
const mockSvar = { current: [] };
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  getDocs: async () => {
    if (mockSvar.current instanceof Error) throw mockSvar.current;
    return { docs: mockSvar.current.map((b) => ({ id: b.id ?? b.uid, data: () => b })) };
  },
}));
vi.mock('../../../components/ClubBadge', () => ({ default: () => null }));

import PuljeAfsloering, { enegaengerTekst, ENEGAENGER_MINIMUM } from './PuljeAfsloering';

// F er med, men INGEN vælger det — "ingen tror på F" skal stå i tabellen.
const TEAMS = ['A', 'B', 'C', 'D', 'E', 'F'].map((n) => ({ name: n, short: n }));
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
  standings: STAND, leagues: [LIGA], loading: false,
  facit: null, ligeNu: { top: new Set(['A', 'B', 'C']), bund: null },
  ...over,
});
const raekkerI = (tabel) => [...tabel.querySelectorAll('tr')].map((r) => r.textContent.trim());

beforeEach(() => { mockSvar.current = BETS; });

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

  it('et hold, INGEN tror på, står med "0 af 3" — det er information, ikke støj', async () => {
    render(<PuljeAfsloering {...props()} />);
    const tabel = await screen.findByTestId('pulje-holdtabel');
    const raekker = raekkerI(tabel);
    expect(raekker).toHaveLength(TEAMS.length);
    expect(raekker.find((r) => r.startsWith('F'))).toContain('0 af 3');
  });

  it('markerer holdene, der står der lige nu, med 🏆', async () => {
    render(<PuljeAfsloering {...props()} />);
    const raekker = raekkerI(await screen.findByTestId('pulje-holdtabel'));
    expect(raekker.find((r) => r.startsWith('A'))).toContain('🏆');
    expect(raekker.find((r) => r.startsWith('D'))).not.toContain('🏆');
  });

  it('enegængeren nævnes ved navn KUN når han er liga-fælle — ellers "kun én spiller"', async () => {
    render(<PuljeAfsloering {...props()} />);
    const raekker = raekkerI(await screen.findByTestId('pulje-holdtabel'));
    // C: kun mig → "kun dig". E: kun u9, som IKKE er liga-fælle → intet navn.
    expect(raekker.find((r) => r.startsWith('C'))).toContain('kun dig');
    expect(raekker.find((r) => r.startsWith('E'))).toContain('kun én spiller');
    expect(raekker.find((r) => r.startsWith('E'))).not.toMatch(/u9/);
  });

  it('DOKUMENT-ID\'ET er identiteten — et uid-felt i data kan ikke gøre Bos tip til "kun dig"', async () => {
    // Reglen kræver uid == id ved skrivning, men et skævt dokument (konsol,
    // script) skal ikke kunne få fladen til at udpege den forkerte (Security-fund).
    mockSvar.current = [
      { uid: 'me', championship: ['A', 'B', 'C'] },
      { id: 'u2', uid: 'me', championship: ['A', 'B', 'D'] },
      { uid: 'u9', championship: ['A', 'E', 'C'] },
    ];
    render(<PuljeAfsloering {...props()} />);
    const raekker = raekkerI(await screen.findByTestId('pulje-holdtabel'));
    expect(raekker.find((r) => r.startsWith('D'))).toContain('kun Bo');
    expect(raekker.find((r) => r.startsWith('D'))).not.toContain('kun dig');
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
    expect(liste.textContent).toMatch(/du — 3 af 3/);
    expect(liste.textContent).toMatch(/Bo — 2 af 3/);
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

  it('under to liga-fæller i stillingen: INGEN rangliste, men en forklaring', async () => {
    // `players.leagueIds` kan halte efter en tilmelding — ligaen findes, men
    // stillingen kender endnu ikke dens medlemmer. Tavshed ville ligne en fejl.
    // Samme sætning som stillingen selv (GameStandings.jsx) — uden liganavn,
    // så der ikke skal bøjes ("Ingen af Kontoret medlemmer", QC-fund).
    render(<PuljeAfsloering {...props({ standings: [STAND[0]] })} />);
    await screen.findByTestId('pulje-holdtabel');
    expect(screen.queryByTestId('pulje-rangliste')).toBeNull();
    expect(screen.getByTestId('pulje-ingen-faeller')).toHaveTextContent(
      'Ingen af ligaens medlemmer er med i stillingen endnu — puljens rangliste kommer, når de er.',
    );
  });

  it('præcis to liga-fæller: ranglisten står, og forklaringen er VÆK', async () => {
    render(<PuljeAfsloering {...props({ standings: [STAND[0], STAND[1]] })} />);
    const liste = await screen.findByTestId('pulje-rangliste');
    expect(liste.textContent).toContain('Bo');
    expect(screen.queryByTestId('pulje-ingen-faeller')).toBeNull();
  });

  it('mens stillingen HENTER, vises forklaringen ikke — den ville blinke forbi på enhver liga', async () => {
    render(<PuljeAfsloering {...props({ standings: [], loading: true })} />);
    await screen.findByTestId('pulje-holdtabel');
    expect(screen.queryByTestId('pulje-ingen-faeller')).toBeNull();
    expect(screen.queryByTestId('pulje-rangliste')).toBeNull();
  });

  it('viser IKKE ranglisten uden ligaer — hold-tabellen står, og der forklares intet', async () => {
    render(<PuljeAfsloering {...props({ standings: [STAND[0]], leagues: [] })} />);
    await screen.findByTestId('pulje-holdtabel');
    expect(screen.queryByTestId('pulje-rangliste')).toBeNull();
    expect(screen.queryByTestId('pulje-ingen-faeller')).toBeNull();
  });

  it('med flere ligaer: en vælger UDEN "alle mine ligaer", og listen følger valget', async () => {
    const FAM = { id: 'f', name: 'Familien', memberUids: ['me', 'u3'] };
    render(<PuljeAfsloering {...props({ leagues: [LIGA, FAM] })} />);
    const vaelger = await screen.findByRole('combobox', { name: 'Vis puljen for' });
    // En rangliste på unionen matcher INGEN ligas stilling — muligheden findes ikke.
    expect([...vaelger.options].map((o) => o.textContent)).toEqual(['Kontoret', 'Familien']);
    // Standard er den FØRSTE liga — Kontoret har Bo, Familien har ikke.
    expect(vaelger.value).toBe('k');
    expect(screen.getByTestId('pulje-rangliste').textContent).toContain('Bo');
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

describe('PuljeAfsloering — PL-formen: top OG bund tæller', () => {
  const KONFIG_PL = { poolSize: 3, nedSize: 2, perTeam: 4, perfectBonus: 10 };
  const LIGE_NU_PL = { top: new Set(['A', 'B', 'C']), bund: new Set(['E', 'F']) };
  const BETS_PL = [
    { uid: 'me', championship: ['A', 'B', 'C'], relegation: ['E', 'F'] },
    { uid: 'u2', championship: ['A', 'B', 'D'], relegation: ['E', 'D'] },
    { uid: 'u9', championship: ['A', 'E', 'D'], relegation: ['A', 'B'] },
  ];

  it('lige nu: "x af 5" er summen af begge spørgsmål', async () => {
    mockSvar.current = BETS_PL;
    render(<PuljeAfsloering {...props({ konfig: KONFIG_PL, ligeNu: LIGE_NU_PL })} />);
    const liste = await screen.findByTestId('pulje-rangliste');
    expect(liste.textContent).toMatch(/du — 5 af 5/);
    expect(liste.textContent).toMatch(/Bo — 3 af 5/);
    expect(liste.textContent).not.toMatch(/af 3/);
  });

  it('afgjort: vinderen kåres på SUMMEN — og en perfekt række i to spørgsmål er +20', async () => {
    // Bo har flest i toppen (3), men "du" har flest i alt (5). Første udgave
    // regnede kun toppen og ville have udråbt Bo (Security-fund).
    mockSvar.current = [
      { uid: 'me', championship: ['A', 'B', 'C'], relegation: ['E', 'F'], correct: 3, points: 22, nedCorrect: 2, nedPoints: 18 },
      { uid: 'u2', championship: ['A', 'B', 'D'], relegation: ['E', 'D'], correct: 3, points: 22, nedCorrect: 1, nedPoints: 4 },
      { uid: 'u9', championship: ['A', 'E', 'D'], relegation: ['A', 'B'], correct: 1, points: 4, nedCorrect: 0, nedPoints: 0 },
    ];
    render(<PuljeAfsloering {...props({ konfig: KONFIG_PL, ligeNu: null, facit: { top: ['A', 'B', 'C'], bund: ['E', 'F'] } })} />);
    const vinder = await screen.findByTestId('pulje-vinder');
    expect(vinder).toHaveTextContent('du');
    expect(vinder).not.toHaveTextContent('Bo');
    expect(vinder).toHaveTextContent('5 af 5');
    expect(vinder).toHaveTextContent('+20 bonus');
    expect(vinder).not.toHaveTextContent('+10 bonus');
    expect(vinder).toHaveTextContent('+40 point');
    expect(screen.getByTestId('pulje-rangliste').textContent).toMatch(/Bo — 4 af 5 · \+26/);
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
    // facit er bevidst UENIGT med serverens correct for u2 (klienten ville
    // give 3 af 3) — serveren skal vinde, ellers har vi to kilder.
    render(<PuljeAfsloering {...props({ facit: { top: ['A', 'B', 'D'], bund: null } })} />);
    const vinder = await screen.findByTestId('pulje-vinder');
    expect(vinder).toHaveTextContent('du');
    expect(vinder).toHaveTextContent('3 af 3');
    expect(vinder).toHaveTextContent('perfekt række');
    expect(vinder).toHaveTextContent('+10 bonus');
    const liste = screen.getByTestId('pulje-rangliste');
    expect(liste.textContent).toMatch(/Bo — 2 af 3/);   // serverens 2, ikke klientens 3
    expect(screen.queryByText(/Intet er afgjort endnu/)).toBeNull();
    // 🏆 FØLGER FACIT, ikke "lige nu": ligeNu har C, facit har D.
    const raekker = raekkerI(screen.getByTestId('pulje-holdtabel'));
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

  it('klientens facit findes, serveren har IKKE afregnet endnu: tallene kommer fra facit, ikke "0 for alle"', async () => {
    // PuljeTip nulstiller `ligeNu`, så snart klientens facit findes. Er
    // serveren så bagud (ét kampdokument mangler mål), ville toppen være tom
    // og ALLE stå med 0 af 3 — netop i det øjeblik puljen afgøres (QC-fund).
    mockSvar.current = [AFGJORT[0], { uid: 'u2', championship: ['A', 'B', 'D'] }];
    render(<PuljeAfsloering {...props({ ligeNu: null, facit: { top: ['A', 'B', 'C'], bund: null } })} />);
    const liste = await screen.findByTestId('pulje-rangliste');
    expect(liste.textContent).toMatch(/du — 3 af 3/);
    expect(liste.textContent).toMatch(/Bo — 2 af 3/);
    expect(liste.textContent).not.toMatch(/0 af 3/);
    expect(screen.queryByTestId('pulje-vinder')).toBeNull();
    expect(screen.getByText(/Intet er afgjort endnu/)).toBeInTheDocument();
    const raekker = raekkerI(screen.getByTestId('pulje-holdtabel'));
    expect(raekker.find((r) => r.startsWith('A'))).toContain('🏆');
  });

  it('hverken "lige nu" eller facit (tidligt i sæsonen): tabellen står, ingen 🏆, alle 0', async () => {
    render(<PuljeAfsloering {...props({ ligeNu: null, facit: null })} />);
    const tabel = await screen.findByTestId('pulje-holdtabel');
    expect(tabel.textContent).not.toContain('🏆');
    expect(screen.getByTestId('pulje-rangliste').textContent).toMatch(/du — 0 af 3/);
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
