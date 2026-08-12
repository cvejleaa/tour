// ---------------------------------------------------------------------------
// HVER FLADE SKAL LÆSE VISNINGSNAVNET — listen står her.
//
// `teamsOf()` lægger `vis` på hvert hold, og kommentaren dér lovede, at "alle
// fem flader får visningsnavnet af sig selv". Det passede ikke: feltet blev
// lagt på, men pulje-tippet og spilprofilen blev ved med at skrive `t.name`.
// Så viste kampkortet "Brighton", mens knappen ved siden af sagde "Brighton and
// Hove Albion" — den samme drift, som `sammeVisning.test.jsx` findes for.
//
// Test Manager fandt det ved at fjerne `info?.vis ||` fra EloTable og
// SuperligaTable: begge mutationer overlevede en grøn suite på 1913 tests.
//
// FILEN HER ER LISTEN. Tilføjes en flade, der viser holdnavne, hører den til
// herinde. Kampkortet er dækket i `FootballTip.test.jsx` og tipshistorikken i
// `TipsHistorik.test.jsx`, hvor resten af de to flader også står.
//
// HVER TEST BRUGER ET NAVN, DER FAKTISK ÆNDRER SIG. En assertion på et hold,
// hvis visningsnavn er lig dets navn, består også, når `vis` er tabt — præcis
// den fælde, `sammeVisning.test.jsx` advarer imod i sin egen kommentar.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  onSnapshot: (_ref, cb) => { cb({ exists: () => false, data: () => null }); return () => {}; },
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'A' } }) }));
vi.mock('./gameActions', () => ({ setPuljeBet: vi.fn(), setPlayerFavoriteTeam: vi.fn() }));

import EloTable from './football/EloTable';
import FootballTable from './football/FootballTable';
import PuljeTip from './football/PuljeTip';
import GameProfile from './GameProfile';
import { visOf, teamsOf } from './football/teamInfo';

// TO ARTER AF VISNINGSNAVN I ÉT SPIL:
//   husets forslag   FC Nordsjælland → Nordsjælland   (VISNINGSNAVN)
//   spillets egen    Brøndby IF      → Brøndby        (teamStyles)
// Begge skal slå igennem hvert sted, og de rammer hver sin gren i
// `visningsnavn()`. Dækkes kun den ene, kan den anden falde ubemærket.
const TEAMS = [
  { name: 'FC Nordsjælland', short: 'FCN', elo: 1537, color: '#B80112' },
  { name: 'Brøndby IF', short: 'BIF', elo: 1571, color: '#003DA5' },
  { name: 'Silkeborg IF', short: 'SIF', elo: 1453, color: '#CA202C' },
];
const SPIL = {
  id: 'sl',
  type: 'football',
  teams: TEAMS,
  teamStyles: { 'Brøndby IF': { visningsnavn: 'Brøndby' } },
};

/** Al tekst i det renderede træ — så en flade ikke kan snige det gamle navn ind. */
const tekst = (c) => c.textContent;

describe('visOf — det navn, en flade skal skrive', () => {
  // Selve funktionen var helt utestet: `return name` altid overlevede.
  it('giver husets forslag for et hold uden override', () => {
    expect(visOf(teamsOf(SPIL), 'FC Nordsjælland')).toBe('Nordsjælland');
  });

  it('lader spillets override vinde', () => {
    expect(visOf(teamsOf(SPIL), 'Brøndby IF')).toBe('Brøndby');
  });

  // Uden fallbacken ville et ukendt hold hedde ingenting på skærmen.
  it('falder tilbage på det rå navn for et hold uden for listen', () => {
    expect(visOf(teamsOf(SPIL), 'Hvidovre IF')).toBe('Hvidovre IF');
  });

  it('falder tilbage på navnet, når der slet ingen liste er', () => {
    expect(visOf(null, 'FC Nordsjælland')).toBe('FC Nordsjælland');
  });
});

describe('Elo-tabellen', () => {
  it('viser visningsnavnet, ikke det fulde', () => {
    const { container } = render(<EloTable game={SPIL} />);
    const navne = [...container.querySelectorAll('.elo-team__name')].map((e) => e.textContent);
    expect(navne).toContain('Nordsjælland');
    expect(navne).toContain('Brøndby');
    expect(navne).not.toContain('FC Nordsjælland');
    expect(navne).not.toContain('Brøndby IF');
  });

  // KOLONNEN VISER NAVNE, IKKE KODER. Tabellen viste kortkoden (`row.short`),
  // indtil den blev skiftet ud — samme grund som alle andre steder: spillerne
  // ved ikke, hvad forkortelserne betyder.
  it('viser ikke kortkoden i navnekolonnen', () => {
    const { container } = render(<EloTable game={SPIL} />);
    const navne = [...container.querySelectorAll('.elo-team__name')].map((e) => e.textContent);
    expect(navne).not.toContain('FCN');
    expect(navne).not.toContain('BIF');
  });

  // ET HOLD UDEN FORSLAG OG UDEN OVERRIDE beholder sit eget navn. Det er den
  // gren, der ER levende her — `eloRows` bygger rækkerne af `teams`, så et
  // hold uden for listen findes ikke, og `|| row.name`-fallbacken kan ikke nås
  // udefra (se kommentaren i EloTable.jsx).
  it('lader et hold uden visningsnavn beholde sit eget', () => {
    const { container } = render(<EloTable game={{
      ...SPIL,
      teams: [...TEAMS, { name: 'Hvidovre IF', short: 'HIF', elo: 1400 }],
    }} />);
    const navne = [...container.querySelectorAll('.elo-team__name')].map((e) => e.textContent);
    expect(navne).toContain('Hvidovre IF');
    expect(navne).not.toContain('');
  });

  // Det EKSAKTE navn skal stadig kunne læses: kolonnen er sticky og klippes med
  // ellipsis under 600 px, og tre af de 32 navne rammer loftet.
  it('lægger det eksakte navn i title', () => {
    const { container } = render(<EloTable game={SPIL} />);
    const titler = [...container.querySelectorAll('.elo-team__name')].map((e) => e.getAttribute('title'));
    expect(titler).toContain('FC Nordsjælland');
    expect(titler).toContain('Brøndby IF');
  });
});

describe('Superliga-stillingen', () => {
  const medStilling = {
    ...SPIL,
    standings: [
      { rank: 1, teamName: 'FC Nordsjælland', teamShortName: 'FCN', played: 3, won: 3, draw: 0, lost: 0, gf: 6, ga: 1, points: 9 },
      { rank: 2, teamName: 'Brøndby IF', teamShortName: 'BIF', played: 3, won: 2, draw: 0, lost: 1, gf: 4, ga: 3, points: 6 },
    ],
  };

  it('viser visningsnavnet i tabellen', () => {
    const { container } = render(<FootballTable game={medStilling} />);
    const navne = [...container.querySelectorAll('.sltab__name')].map((e) => e.textContent);
    expect(navne).toEqual(['Nordsjælland', 'Brøndby']);
  });

  // Rækken kommer fra API'et med sit EGET `teamName`, og det er dét, koden
  // falder tilbage på. Et hold, seedet under et andet navn end API'ets, må
  // stadig kunne læses.
  it('falder tilbage på API-navnet for et hold uden for listen', () => {
    const { container } = render(<FootballTable game={{
      ...SPIL,
      standings: [{ rank: 1, teamName: 'Hvidovre IF', played: 1, won: 1, draw: 0, lost: 0, gf: 2, ga: 0, points: 3 }],
    }} />);
    expect(tekst(container)).toContain('Hvidovre IF');
  });
});

describe('Pulje-tippet', () => {
  it('viser visningsnavnet på knapperne', () => {
    const { container } = render(<PuljeTip game={SPIL} matches={[]} />);
    const navne = [...container.querySelectorAll('.pulje-team__name')].map((e) => e.textContent);
    expect(navne).toContain('Nordsjælland');
    expect(navne).toContain('Brøndby');
    expect(navne).not.toContain('FC Nordsjælland');
    expect(navne).not.toContain('Brøndby IF');
  });
});

describe('Spilprofilen — yndlingshold', () => {
  it('viser visningsnavnet i vælgeren', () => {
    render(<GameProfile game={SPIL} me={{}} />);
    const valg = [...screen.getByLabelText('Yndlingshold').options].map((o) => o.textContent);
    expect(valg).toContain('Nordsjælland');
    expect(valg).toContain('Brøndby');
    expect(valg).not.toContain('FC Nordsjælland');
  });

  // VÆRDIEN ER STADIG DET EKSAKTE NAVN. Den gemmes i `favoriteTeam` og bruges
  // til at slå holdet op igen — skiftede den med til visningsnavnet, ville
  // avataren miste sin farve, og gamle gemte valg ville ikke længere matche.
  it('gemmer stadig det eksakte navn som værdi', () => {
    render(<GameProfile game={SPIL} me={{}} />);
    const valg = [...screen.getByLabelText('Yndlingshold').options].map((o) => o.value);
    expect(valg).toContain('FC Nordsjælland');
    expect(valg).toContain('Brøndby IF');
  });

  // SORTERINGEN FØLGER DET VISTE NAVN. Sorterede den på `name`, stod
  // "Nordsjælland" under F og altså et tilfældigt sted i en liste, brugeren
  // læser som alfabetisk. Her: Brøndby, Nordsjælland, Silkeborg IF — mens
  // sortering på `name` ville give Brøndby IF, FC Nordsjælland, Silkeborg IF,
  // som vist bliver Brøndby, Nordsjælland, Silkeborg IF … samme rækkefølge.
  // Derfor et hold MERE, hvor de to rækkefølger faktisk skilles ad.
  it('sorterer efter det viste navn, ikke det eksakte', () => {
    const spil = {
      ...SPIL,
      teams: [...TEAMS, { name: 'AGF', short: 'AGF', elo: 1578, color: '#0A2240' }],
      // "Ålborg" sorterer sidst på dansk, "AaB" ville sortere først.
      teamStyles: { ...SPIL.teamStyles, AGF: { visningsnavn: 'Århus' } },
    };
    render(<GameProfile game={spil} me={{}} />);
    // Det tomme valg står altid først og tælles ikke med.
    const valg = [...screen.getByLabelText('Yndlingshold').options].slice(1).map((o) => o.textContent);
    expect(valg).toEqual(['Brøndby', 'Nordsjælland', 'Silkeborg IF', 'Århus']);
  });

  it('viser visningsnavnet for det VALGTE hold', () => {
    const { container } = render(<GameProfile game={SPIL} me={{ favoriteTeam: 'FC Nordsjælland' }} />);
    expect(tekst(container)).toContain('Nordsjælland');
    expect(tekst(container)).not.toContain('FC Nordsjælland');
  });
});
