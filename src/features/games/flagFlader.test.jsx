// ---------------------------------------------------------------------------
// HVER BADGE-FLADE SKAL VISE LANDEFLAGET — listen står her.
//
// `teamsOf()` lægger `flag` på hvert hold (alt eller intet, landeflag.js), men
// feltet skal LÆSES af hver flade, og det sker ikke af sig selv: 6 af de 8
// steder tegner badgen af rådata uden om `badgeFor`. Præcis den drift,
// `visningsnavnFlader.test.jsx` findes for — et felt lagt på ét sted, men kun
// læst nogle steder.
//
// FILEN HER ER LISTEN. Tilføjes en flade, der tegner en hold-badge (et
// `ClubBadge`-kald med holdets trøje), hører den til herinde.
//   Kampkortet (Tip)        FootballTip — hjemme og ude
//   Mit hold                GameProfile
//   Puljen                  PuljeTip — holdknapperne
//   Puljens afsløring       PuljeAfsloering — efter deadline
//   Elo-tabellen            EloTable
//   Holdsiden               HoldSide
//   Officiel tabel          FootballTable — kun nåbar med `standings`
//   Mål og målchancer       HoldXgListe — kun nåbar med `harXg`
//   Grupperne               Grupper (📊 Grupper) — kun nåbar med `harGrupper`
//                           (rækkerne er TabelRaekke, delt med den officielle tabel)
// De to sidste er ikke nåbare for håndbold i dag, men får flaget alligevel:
// en evne, der udvides, følges hele vejen ud (CLAUDE.md, «Korrekt er ikke
// komplet»). Admin-cirklen i Hold-farver får det MED VILJE ikke.
//
// HVER FLADE TESTES TRE GANGE: håndbold-VM med flag (img, alt="", ingen
// trøje), Superligaen (ingen img, trøjen står), og håndbold-VM hvor ét hold
// mangler `iso2` (ingen flag NOGEN steder — alt eller intet). Fixturen er
// holdfilens egne hold, altså produktionens form.
//
// Nederst: TEKSTERNE, der skal skifte med evnen (TroejeOversigt, guiden, Mit
// hold) — med assertions på det, der IKKE må stå.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase', () => ({ db: {}, functions: {} }));
const mockPuljeBets = { current: [] };
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  collection: () => ({}),
  onSnapshot: (_ref, cb) => { cb({ exists: () => false, data: () => null }); return () => {}; },
  getDocs: async () => ({ docs: mockPuljeBets.current.map((b) => ({ id: b.uid, data: () => b })) }),
}));
vi.mock('./useGameStandings', () => ({
  useGameStandings: () => ({ standings: [{ uid: 'A', name: 'Mig' }], leagues: [], loading: false, error: null }),
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'A' }, profile: {} }) }));
vi.mock('./gameActions', () => ({ setPuljeBet: vi.fn(), setPlayerFavoriteTeam: vi.fn() }));
vi.mock('./useGameBets', () => ({ useGameBets: () => ({ betsByMatch: {}, loading: false }) }));
vi.mock('./useVisibleGameStandings', () => ({
  useVisibleGameStandings: () => ({ standings: [], leagues: [], leagueCount: 0, loading: false, error: null }),
}));
vi.mock('./betActions', () => ({
  setBet: vi.fn().mockResolvedValue({ ok: true }),
  setChance: vi.fn().mockResolvedValue({ ok: true, indsats: 0, flyttetFra: [] }),
}));
vi.mock('./football/LeagueBets', () => ({ default: () => null }));
vi.mock('../../lib/share', () => ({ shareText: vi.fn().mockResolvedValue({ ok: true }) }));

import FootballTip from './football/FootballTip';
import GameProfile from './GameProfile';
import PuljeTip from './football/PuljeTip';
import EloTable from './football/EloTable';
import HoldSide from './football/HoldSide';
import FootballTable from './football/FootballTable';
import HoldXgListe from './football/HoldXgListe';
import TroejeOversigt from './football/TroejeOversigt';
import FootballHelp from './football/FootballHelp';
import Grupper from './football/Grupper';
import { GAMES } from '../../../scripts/games.mjs';
import { ringOgTemaTekst } from './football/yndlingsholdTekst';
import { HAANDBOLD_VM2027_HOLD } from '../../data/haandboldVm2027Hold';
import { SUPERLIGA_TEAMS_2026 } from '../../data/superligaTeams2026';

// ── Fixturerne ──────────────────────────────────────────────────────────
const HB_NAVNE = ['Danmark', 'Norge', 'Sverige', 'Frankrig'];
const HB_HOLD = HAANDBOLD_VM2027_HOLD.filter((t) => HB_NAVNE.includes(t.name));
const SL_HOLD = SUPERLIGA_TEAMS_2026.slice(0, 4);
const HB = { id: 'hvm2027', type: 'football', sport: 'haandbold', name: 'Håndbold-VM 2027', teams: HB_HOLD };
const SL = { id: 'superliga2627', type: 'football', name: 'Superligaen', teams: SL_HOLD };
const udenFelter = (t, felter) => Object.fromEntries(Object.entries(t).filter(([k]) => !felter.includes(k)));
// ÉT hold uden iso2 — så har spillet INGEN flag (alt eller intet).
const MANGLER = {
  ...HB,
  teams: HB_HOLD.map((t) => (t.name === 'Frankrig' ? udenFelter(t, ['iso2']) : t)),
};

const navneAf = (game) => game.teams.map((t) => t.name);
// Spillets hold i én gruppe på håndbold-VM's kalender — evnen harGrupper er
// DATA (gyldige grupper + kalender + holdliste), ikke sporten, så også
// Superliga-fixturen får fladen, når den får grupper (som FootballTable med
// standings nedenfor).
const HVM_FASER = GAMES.find((g) => g.id === 'hvm2027').faser;
const medGrupper = (game) => ({
  ...game,
  faser: HVM_FASER,
  grupper: {
    point: { sejr: 2, uafgjort: 1 },
    faser: [
      { fase: 'Indledende runde', videre: 3, grupper: [{ navn: 'A', hold: navneAf(game) }] },
      { fase: 'Hovedrunde', videre: 2, grupper: [{ navn: 'I', fra: ['A'] }] },
    ],
  },
});
const koderAf = (game, navne) => navne.map((n) => game.teams.find((t) => t.name === n).iso2);

// ── Det, der måles ──────────────────────────────────────────────────────
const flagImgs = (c) => [...c.querySelectorAll('.club-flag img')];
const flagKoder = (c) => flagImgs(c).map((i) => (/\/([a-z]{2})\.svg$/.exec(i.getAttribute('src') || '') || [])[1]);
// Trøjen er det eneste svg med en klipsti `troeje-klip-N` (ClubBadge.jsx).
const troejer = (c) => c.querySelectorAll('clipPath[id^="troeje-klip"]').length;

function erFlag(c, forventet) {
  const imgs = flagImgs(c);
  expect(imgs.length).toBeGreaterThan(0);
  for (const i of imgs) {
    expect(i.getAttribute('alt')).toBe('');
    expect(i.getAttribute('aria-hidden')).toBe('true');
  }
  expect(flagKoder(c).sort()).toEqual([...forventet].sort());
  // DEN, DER GØR «FLAGET KOM OVENI TRØJEN» RØD.
  expect(troejer(c)).toBe(0);
}

function erTroeje(c) {
  expect(flagImgs(c)).toHaveLength(0);
  expect(c.querySelectorAll('img')).toHaveLength(0);
  expect(troejer(c)).toBeGreaterThan(0);
}

const iRouter = (el, url = '/spil/g') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/spil/:gameId" element={el} /></Routes>
  </MemoryRouter>,
);

// ── Fladerne ────────────────────────────────────────────────────────────
const SENERE = new Date('2030-01-13T17:00:00Z');
const FORBI = new Date('2020-01-01T00:00:00Z');

/** Round robin med xG — 3 kampe pr. hold, over listens gulv (3) og mindst 4 hold. */
function xgKampe(navne) {
  const ud = [];
  let id = 0;
  for (let i = 0; i < navne.length; i += 1) {
    for (let j = i + 1; j < navne.length; j += 1) {
      id += 1;
      ud.push({
        id: `x${id}`, round: 1, home: navne[i], away: navne[j], kickoff: 1000 + id,
        result: '1', homeGoals: 30, awayGoals: 25, xgHome: 28.5, xgAway: 26.1,
      });
    }
  }
  return ud;
}

const FLADER = [
  {
    navn: 'kampkortet (Tip) — hjemme og ude',
    vis: async (game) => {
      const [h, a] = navneAf(game);
      const kampe = [{ id: 'm1', round: 1, home: h, away: a, kickoff: SENERE, odds: { 1: 2, X: 6, 2: 3 } }];
      return iRouter(<FootballTip game={{ ...game, eloHistory: [] }} me={{ uid: 'A', totalPoints: 0 }} matches={kampe} />, '/spil/g?runde=1').container;
    },
    koder: (game) => koderAf(game, navneAf(game).slice(0, 2)),
  },
  {
    navn: 'Mit hold — det valgte hold',
    vis: async (game) => {
      const c = render(<GameProfile game={game} me={{ favoriteTeam: navneAf(game)[0] }} />).container;
      // TroejeOversigt står på samme kort og har sine egne trøjer — måles for sig nedenfor.
      return c.querySelector('.card > .flex');
    },
    koder: (game) => koderAf(game, navneAf(game).slice(0, 1)),
  },
  {
    navn: 'puljen — holdknapperne',
    vis: async (game) => {
      mockPuljeBets.current = [{ uid: 'A', championship: navneAf(game).slice(0, 2) }];
      const c = render(<PuljeTip game={{ ...game, pulje: { poolSize: 2 }, puljeLockAt: FORBI }} matches={[]} />).container;
      return c.querySelector('.pulje-grid');
    },
    koder: (game) => koderAf(game, navneAf(game)),
  },
  {
    navn: 'puljens afsløring — efter deadline',
    vis: async (game) => {
      mockPuljeBets.current = [{ uid: 'A', championship: navneAf(game).slice(0, 2) }];
      render(<PuljeTip game={{ ...game, pulje: { poolSize: 2 }, puljeLockAt: FORBI }} matches={[]} />);
      return screen.findByTestId('pulje-holdtabel');
    },
    // Tabellen viser ALLE spillets hold («0 af 1» for dem, ingen valgte).
    koder: (game) => koderAf(game, navneAf(game)),
  },
  {
    navn: 'Elo-tabellen',
    vis: async (game) => iRouter(<EloTable game={game} />).container,
    koder: (game) => koderAf(game, navneAf(game)),
  },
  {
    navn: 'holdsiden',
    vis: async (game) => {
      const t = game.teams[0];
      return iRouter(<HoldSide game={game} matches={[]} short={t.short} />).container.querySelector('.card');
    },
    koder: (game) => koderAf(game, navneAf(game).slice(0, 1)),
  },
  {
    navn: 'den officielle tabel',
    vis: async (game) => {
      const standings = game.teams.map((t, i) => ({
        rank: i + 1, teamName: t.name, played: 1, won: 1, draw: 0, lost: 0, gf: 30, ga: 25, points: 2,
      }));
      return iRouter(<FootballTable game={{ ...game, standings }} />).container;
    },
    koder: (game) => koderAf(game, navneAf(game)),
  },
  {
    navn: 'grupperne (📊 Grupper)',
    vis: async (game) => iRouter(<Grupper game={medGrupper(game)} matches={[]} />).container.querySelector('[data-testid="gruppe-A"]'),
    koder: (game) => koderAf(game, navneAf(game)),
  },
  {
    navn: 'mål og målchancer (xG-listen)',
    vis: async (game) => iRouter(<HoldXgListe game={game} matches={xgKampe(navneAf(game))} />).container,
    koder: (game) => koderAf(game, navneAf(game)),
  },
];

beforeEach(() => { mockPuljeBets.current = []; });

describe.each(FLADER)('$navn', ({ vis, koder }) => {
  it('håndbold-VM: viser landeflaget — dekorativt, og ingen trøje', async () => {
    const c = await vis(HB);
    erFlag(c, koder(HB));
  });

  it('håndbold-VM: navnet står som tekst ved siden af flaget', async () => {
    const c = await vis(HB);
    const navne = HB.teams.filter((t) => koder(HB).includes(t.iso2)).map((t) => t.name);
    for (const n of navne) expect(c.textContent).toContain(n);
  });

  it('Superligaen: trøjen som før, intet billede', async () => {
    erTroeje(await vis(SL));
  });

  it('ét hold uden iso2: ingen flag nogen steder — alt eller intet', async () => {
    erTroeje(await vis(MANGLER));
  });
});

// ---------------------------------------------------------------------------
// TEKSTERNE. Et flag-spil tegner ingen trøjer, så alt, der forklarer eller
// henviser til trøjer, skal væk — og det, der står i stedet, skal være sandt.
// Samme evne som badgen (`harLandeflag`), så de to ikke kan uenes.
// ---------------------------------------------------------------------------
describe('trøjeoversigten', () => {
  it('er VÆK i et flag-spil', () => {
    const { container } = render(<TroejeOversigt game={HB} />);
    expect(container.querySelector('.troejer')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('står der stadig i Superligaen — og i håndbold-VM, hvis ét hold mangler flag', () => {
    expect(render(<TroejeOversigt game={SL} />).container.querySelector('.troejer')).not.toBeNull();
    expect(render(<TroejeOversigt game={MANGLER} />).container.querySelector('.troejer')).not.toBeNull();
  });
});

describe('guiden', () => {
  const guide = (game) => render(<MemoryRouter><FootballHelp game={game} /></MemoryRouter>)
    .container.textContent.replace(/\s+/g, ' ');

  it('flag-spil: ingen trøjeoversigt, ingen tre trøjer — ring og tema i landets farve', () => {
    const t = guide(HB);
    expect(t).not.toMatch(/trøjeoversigten/);
    expect(t).not.toMatch(/tre trøjer/);
    expect(t).not.toMatch(/trøjens farve/);
    expect(t).not.toMatch(/klubbens farve/);
    expect(t).toContain(ringOgTemaTekst(true));
    // Ordlyden selv: ringen bærer landets TO farver (sekundærfarven er
    // awayColor, badges.js `sekundaerAf`), temaet den ene.
    expect(t).toContain('Din avatar får landets farver som ring om sig i stillingen');
    expect(t).not.toContain('landets farve som ring');
    expect(t).toContain('Klik på et holdnavn — i Elo-tabellen eller på et kampkort — så får du');
  });

  it('flag-spil MED stilling: den officielle tabel nævnes stadig', () => {
    const t = guide({ ...HB, standings: [{ rank: 1 }] });
    expect(t).toContain('i Elo-tabellen, i den officielle tabel eller på et kampkort');
    expect(t).not.toMatch(/trøjeoversigten/);
  });

  // 📊 Grupper i guiden — samme evne som fanen. Uden grupper står intet af
  // det (den eksakte holdside-sætning ovenfor er HB UDEN grupper).
  it('flag-spil MED grupper: fanen, pointsystemet og «i grupperne»', () => {
    const t = guide(medGrupper(HB));
    expect(t).toContain('Følg grupperne under 📊 Grupper og jeres indbyrdes 🏆 Stilling');
    expect(t).toContain('📊 Grupper viser gruppetabellerne, regnet af kampenes resultater her i spillet: 2 point for en sejr, 1 for uafgjort.');
    expect(t).toContain('I hovedrunden tæller resultaterne fra den indledende runde mod de andre hold fra samme gruppe, der også gik videre, med.');
    expect(t).toContain('Hovedrundens grupper fylder sig selv, når kampene er lagt ind');
    expect(t).toContain('Klik på et holdnavn — i Elo-tabellen, i grupperne eller på et kampkort — så får du');
    expect(t).not.toMatch(/alle IHF/i);
    const links = [...iRouter(<FootballHelp game={medGrupper(HB)} />).container.querySelectorAll('a')]
      .filter((a) => a.textContent === '📊 Grupper');
    expect(links.length).toBe(2);
    for (const a of links) expect(a.getAttribute('href')).toContain('fane=grupper');
  });

  it('flag-spil UDEN grupper: ingen 📊 Grupper og ingen «i grupperne»', () => {
    const t = guide(HB);
    expect(t).not.toContain('📊 Grupper');
    expect(t).not.toContain('i grupperne');
    expect(t).not.toContain('point for en sejr');
  });

  it('Superligaen: alt står som før', () => {
    const t = guide(SL);
    expect(t).toContain('i Elo-tabellen, i trøjeoversigten under 🙂 Mit hold eller på et kampkort');
    expect(t).toContain('Nederst på fanen står alle holdenes tre trøjer');
    expect(t).toContain(ringOgTemaTekst(false));
    expect(t).not.toContain(ringOgTemaTekst(true));
  });
});

describe('Mit hold — teksterne', () => {
  const profil = (game, favoriteTeam) => render(<GameProfile game={game} me={{ favoriteTeam }} />);

  it('flag-spil: landets farve, samme farve på ring og tema — og ingen trøje nogen steder', () => {
    profil(HB, 'Danmark');
    const yndling = screen.getByTestId('yndlingshold-tekst').textContent.replace(/\s+/g, ' ');
    expect(yndling).toContain(ringOgTemaTekst(true));
    // RINGEN ER TOFARVET (rød yderst, hvid inderst — badges.js `sekundaerAf`),
    // så «har samme farve.» alene var kun halvt sandt (QC på 3419ff6).
    const tema = screen.getByTestId('tema-tekst').textContent.replace(/\s+/g, ' ').trim();
    expect(tema).toBe('Spillet tones i landets farve. Ringen om din avatar har samme farve yderst og landets anden farve inderst.');
    expect(tema).not.toMatch(/har samme farve\./);
    // Hele kortet — også TroejeOversigt og «Ingen af … tre trøjer».
    expect(document.body.textContent).not.toMatch(/trøje/i);
    expect(document.body.textContent).not.toMatch(/klubfarve/i);
  });

  // EN ADMIN-RETTELSE KAN SKILLE RING OG TEMA. Norge med hvid hjemmefarve:
  // ringen er hvid, temaet springer til udefarven — og så må teksten ikke
  // påstå, at de er ens.
  it('flag-spil: siger det, når ring og tema ikke er den samme farve', () => {
    profil({ ...HB, teamStyles: { Norge: { color: '#FFFFFF' } } }, 'Norge');
    const t = screen.getByTestId('tema-tekst').textContent.replace(/\s+/g, ' ').trim();
    // Norge er stadig tofarvet: hvid yderst (rettelsen), blå inderst (awayColor).
    expect(t).toBe('Spillet tones i landets farve. Ringen om din avatar har holdets første farve yderst og den anden inderst — her er temaet ikke ringens yderste farve.');
    expect(t).not.toMatch(/samme farve/);
    expect(t).not.toMatch(/de to ikke den samme/);
  });

  // ENSFARVET RING — udefarven rettet til hjemmefarven: så er der ingen anden
  // farve, og teksten må ikke love en stribe.
  it('flag-spil med ensfarvet ring: «samme farve» uden en anden farve', () => {
    profil({ ...HB, teamStyles: { Danmark: { awayColor: '#C8102E' } } }, 'Danmark');
    const t = screen.getByTestId('tema-tekst').textContent.replace(/\s+/g, ' ').trim();
    expect(t).toBe('Spillet tones i landets farve. Ringen om din avatar har samme farve.');
    expect(t).not.toMatch(/inderst/);
  });

  // RING UDEN TEMA: ingen af landets farver har kulør nok til et tema, men
  // hjemmefarven giver stadig en ring — og her stod «holdets farve som
  // ellers», ental, om en tofarvet ring.
  it('flag-spil, ring men intet tema: siger landets to farver — eller én', () => {
    profil({ ...HB, teamStyles: { Danmark: { color: '#FFFFFF', awayColor: '#111111', thirdColor: '#FFFFFF' } } }, 'Danmark');
    let t = screen.getByTestId('tema-tekst').textContent.replace(/\s+/g, ' ').trim();
    expect(t).toBe('Danmark har ingen farve med kulør nok til at tone en hel side, så spillet bliver stående i appens grønne. Ringen om din avatar får stadig landets to farver.');
    expect(t).not.toMatch(/holdets farve som ellers/);
    cleanup();
    profil({ ...HB, teamStyles: { Danmark: { color: '#FFFFFF', awayColor: '#FFFFFF', thirdColor: '#FFFFFF' } } }, 'Danmark');
    t = screen.getByTestId('tema-tekst').textContent.replace(/\s+/g, ' ').trim();
    expect(t).toBe('Danmark har ingen farve med kulør nok til at tone en hel side, så spillet bliver stående i appens grønne. Ringen om din avatar får stadig landets farve.');
    expect(t).not.toMatch(/to farver/);
  });

  it('flag-spil uden farver: intet tema, ingen ring — og teksten lover ingen', () => {
    const uden = { ...HB, teams: HB_HOLD.map((t) => udenFelter(t, ['color', 'awayColor'])) };
    profil(uden, 'Danmark');
    const t = screen.getByTestId('tema-tekst').textContent.replace(/\s+/g, ' ').trim();
    expect(t).toBe('Danmark har ingen farve med kulør nok til at tone en hel side, så spillet bliver stående i appens grønne. Holdet har ingen farve, så din avatar får ingen ring.');
    expect(t).not.toMatch(/Ringen om din avatar får/);
  });

  it('Superligaen: trøjen og klubfarven som før', () => {
    profil(SL, SL_HOLD[0].name);
    expect(screen.getByTestId('yndlingshold-tekst').textContent.replace(/\s+/g, ' ')).toContain(ringOgTemaTekst(false));
    expect(document.body.textContent).toMatch(/Sådan tegnes trøjerne/);
  });

  // QC (c): ingen grå ring — og ingen tekst, der lover en.
  it('Superligaen, hold uden farve og uden kulør: siger, at der ingen ring er', () => {
    const spil = { ...SL, teams: [...SL_HOLD, { name: 'Hvidovre IF', short: 'HIF', elo: 1400 }] };
    profil(spil, 'Hvidovre IF');
    const t = screen.getByTestId('tema-tekst').textContent.replace(/\s+/g, ' ');
    expect(t).toContain('Holdet har ingen farve, så din avatar får ingen ring.');
    expect(t).not.toContain('Ringen om din avatar får trøjens farve som ellers.');
  });
});

// Holdenes navne står i holdfilen; at fixturen faktisk er produktionens form,
// er hele pointen — et fixture med opfundne felter bekræfter sig selv.
describe('fixturen', () => {
  it('er holdfilens egne hold med iso2 og farver', () => {
    expect(HB_HOLD).toHaveLength(4);
    for (const t of HB_HOLD) {
      expect(t.iso2, t.name).toMatch(/^[a-z]{2}$/);
      expect(t.color, t.name).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
