// Tests for GameLeagues — især ?liga=, som "Åbn ligaen →" i stillingen sætter.
// Uden forvalget lander man på en liste, hvor alt er foldet sammen, og linket
// lover mere, end klikket giver.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'me' } }) }));

const mockLeagues = vi.fn();
vi.mock('./useGameLeagues', () => ({ useGameLeagues: () => mockLeagues() }));
const mockStandings = vi.fn();
vi.mock('./useGameStandings', () => ({ useGameStandings: () => mockStandings() }));
const mockMessages = vi.fn();
vi.mock('./useLeagueMessages', () => ({ useLeagueMessages: () => mockMessages() }));
vi.mock('./useLeagueQuestions', () => ({
  useLeagueQuestions: () => ({ questions: [], answers: [], loading: false }),
}));
vi.mock('./LeagueQuestions', () => ({ default: () => <div /> }));
// Avataren mockes, men STOPPER IKKE rekvisitterne: væggens navn OG emoji når kun frem hertil,
// og en test, der kun læser navnet, ser ikke at emojien kommer fra det forkerte sted.
vi.mock('../../components/Avatar', () => ({
  default: ({ name, emoji }) => <span data-testid="avatar" data-name={name ?? ''} data-emoji={emoji ?? ''} />,
}));

import GameLeagues from './GameLeagues';

const LEAGUES = [
  { id: 'L1', name: 'Kontoret', ownerUid: 'anden', memberUids: ['me'], code: 'AAA111' },
  { id: 'L2', name: 'Familien', ownerUid: 'anden', memberUids: ['me'], code: 'BBB222' },
];

const setup = (url = '/spil/sl?fane=ligaer') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/spil/:gameId" element={<GameLeagues gameId="sl" />} />
    </Routes>
  </MemoryRouter>,
);

/** Er ligaens kort foldet ud? Væggens skrivefelt findes kun i åben tilstand. */
const antalÅbne = () => screen.queryAllByPlaceholderText(/Skriv/i).length;

beforeEach(() => {
  vi.clearAllMocks();
  mockLeagues.mockReturnValue({ leagues: LEAGUES, loading: false, error: null });
  mockMessages.mockReturnValue({ messages: [], loading: false });
  mockStandings.mockReturnValue({ standings: [], leagues: [], loading: false, error: null });
});

describe('GameLeagues — forvalgt liga', () => {
  it('folder alt sammen uden ?liga=', () => {
    setup();
    expect(screen.getByText('Kontoret')).toBeInTheDocument();
    expect(antalÅbne()).toBe(0);
  });

  it('folder præcis den liga ud, ?liga= peger på', () => {
    setup('/spil/sl?fane=ligaer&liga=L2');
    // Ét kort åbent — ikke nul, og ikke dem alle.
    expect(antalÅbne()).toBe(1);
  });

  it('folder intet ud, når ?liga= peger på en liga, man ikke er med i', () => {
    setup('/spil/sl?fane=ligaer&liga=findes-ikke');
    expect(antalÅbne()).toBe(0);
  });
});

// Liga-væggen: KUN bottens opslag (system:true, skrives kun af serveren) må
// hente navn og emoji fra dokumentet. Faldt væggen tilbage til dokumentets
// displayName for enhver uid uden for stillingen, kunne et medlem poste som
// "Runde-Botten", forlade ligaen og stå som botten for alle — og et map som
// navn hvidnede fanen (Security-fund). Reglen stopper NYE forfalskninger;
// kun renderingen neutraliserer dem, der allerede ligger der.
describe('GameLeagues — liga-væggen og bottens navn', () => {
  const besked = (over) => ({ id: 'm', text: 'Hej', createdAt: new Date(), ...over });

  it('bottens eget opslag (system:true) vises med bottens navn', () => {
    mockMessages.mockReturnValue({ loading: false, messages: [
      besked({ id: 'b1', uid: 'runde-bot', system: true, displayName: 'Runde-Botten', avatarEmoji: '🤖', text: 'Rundens opsamling' }),
    ] });
    setup('/spil/sl?fane=ligaer&liga=L1');
    expect(screen.getByText('Runde-Botten')).toBeInTheDocument();
    expect(screen.getByText('Rundens opsamling')).toBeInTheDocument();
  });

  it('et opslag UDEN system fra en, der har forladt ligaen, får ALDRIG dokumentets navn — teksten vises stadig', () => {
    mockMessages.mockReturnValue({ loading: false, messages: [
      besked({ id: 'f1', uid: 'gaaet', displayName: 'Runde-Botten', avatarEmoji: '🤖', text: 'Falsk opsamling' }),
    ] });
    setup('/spil/sl?fane=ligaer&liga=L1');
    expect(screen.queryByText('Runde-Botten')).toBeNull();
    expect(screen.getByText('Falsk opsamling')).toBeInTheDocument();
    expect(screen.getByText('Tidligere medlem')).toBeInTheDocument();
  });

  it("'system' skal være PRÆCIS true — false eller en streng er ikke botten", () => {
    // Reglen forbyder feltet for klienter i dag, men et ældre dokument kan
    // bære system:false — og `m.system` som truthy-tjek ville også godtage
    // 'ja'. Kun serverens egen form (true) må låne navnet fra dokumentet.
    mockMessages.mockReturnValue({ loading: false, messages: [
      besked({ id: 'f2', uid: 'gaaet', system: false, displayName: 'Runde-Botten', text: 'Falsk med false' }),
      besked({ id: 'f3', uid: 'gaaet2', system: 'ja', displayName: 'Runde-Botten', text: 'Falsk med streng' }),
    ] });
    setup('/spil/sl?fane=ligaer&liga=L1');
    expect(screen.queryByText('Runde-Botten')).toBeNull();
    expect(screen.getAllByText('Tidligere medlem')).toHaveLength(2);
  });

  it('mens stillingen indlæses, hedder ingen «Tidligere medlem» — og ens eget opslag hedder «Dig»', () => {
    // Før stillingen er inde, mangler ALLE navne; «Tidligere medlem» ville da
    // påstå noget forkert om nuværende deltagere (QC-fund).
    mockStandings.mockReturnValue({ standings: [], leagues: [], loading: true, error: null });
    mockMessages.mockReturnValue({ loading: false, messages: [
      besked({ id: 'l1', uid: 'gaaet', text: 'Mens vi venter' }),
      besked({ id: 'l2', uid: 'me', text: 'Mit eget' }),
    ] });
    setup('/spil/sl?fane=ligaer&liga=L1');
    expect(screen.queryByText(/Tidligere medlem/)).toBeNull();
    expect(screen.getByText('Spiller')).toBeInTheDocument();
    expect(screen.getByText('Dig')).toBeInTheDocument();
    expect(screen.queryByText(/\(dig\)/)).toBeNull();
  });

  it('et map som navn på et ældre opslag hvidner ikke fanen', () => {
    mockMessages.mockReturnValue({ loading: false, messages: [
      besked({ id: 'g1', uid: 'gaaet', displayName: { a: 1 }, avatarEmoji: { b: 2 }, text: 'Gift' }),
    ] });
    expect(() => setup('/spil/sl?fane=ligaer&liga=L1')).not.toThrow();
    expect(screen.getByText('Gift')).toBeInTheDocument();
  });

  // --- Test Manager: de grene der før kunne rettes ubemærket --------------------------------
  // `useGameStandings` var mocket til en TOM stilling, så ingen test kom forbi `byUid[m.uid]`:
  // fjernes opslaget (`|| {}` alene), står HVER almindelig besked som "Tidligere medlem" — med
  // grøn suite. Den nye sti her er den, 99 % af beskederne tager.
  const raekke = (tekst) => screen.getByText(tekst).closest('li');

  it('en almindelig besked fra et medlem viser navn og emoji FRA STILLINGEN — dokumentets egne tæller ikke', () => {
    mockStandings.mockReturnValue({
      standings: [{ uid: 'ida', name: 'Ida', emoji: '🐻', totalPoints: 0 }], leagues: [], loading: false, error: null,
    });
    mockMessages.mockReturnValue({ loading: false, messages: [
      besked({ id: 'k1', uid: 'ida', displayName: 'Forfalsket', avatarEmoji: '🤖', text: 'Hej fra Ida' }),
    ] });
    setup('/spil/sl?fane=ligaer&liga=L1');
    const li = raekke('Hej fra Ida');
    expect(within(li).getByText('Ida')).toBeInTheDocument();
    expect(within(li).queryByText('Forfalsket')).toBeNull();
    expect(within(li).queryByText('Tidligere medlem')).toBeNull();
    expect(within(li).getByTestId('avatar')).toHaveAttribute('data-emoji', '🐻');
  });

  it('ens EGET opslag får «(dig)» efter navnet, når man står i stillingen', () => {
    // «(dig)»-suffikset blev ikke læst af nogen test: det kunne fjernes helt med grøn suite.
    mockStandings.mockReturnValue({
      standings: [{ uid: 'me', name: 'Mig', emoji: '🙂', totalPoints: 0 }], leagues: [], loading: false, error: null,
    });
    mockMessages.mockReturnValue({ loading: false, messages: [
      besked({ id: 'e1', uid: 'me', text: 'Mit eget opslag' }),
    ] });
    setup('/spil/sl?fane=ligaer&liga=L1');
    expect(within(raekke('Mit eget opslag')).getByText('Mig (dig)')).toBeInTheDocument();
  });

  it('bottens opslag bærer bottens navn OG emoji helt ned til avataren', () => {
    mockMessages.mockReturnValue({ loading: false, messages: [
      besked({ id: 'b1', uid: 'runde-bot', system: true, displayName: 'Runde-Botten', avatarEmoji: '🤖', text: 'Rundens opsamling' }),
    ] });
    setup('/spil/sl?fane=ligaer&liga=L1');
    const li = raekke('Rundens opsamling');
    expect(within(li).getByText('Runde-Botten')).toBeInTheDocument();
    expect(within(li).getByTestId('avatar')).toHaveAttribute('data-emoji', '🤖');
  });

  it('selv botten kan ikke hvidne væggen: system:true med map som navn og emoji giver "Bot" uden emoji', () => {
    mockMessages.mockReturnValue({ loading: false, messages: [
      besked({ id: 'b2', uid: 'runde-bot', system: true, displayName: { a: 1 }, avatarEmoji: { b: 2 }, text: 'Gift fra serveren' }),
    ] });
    expect(() => setup('/spil/sl?fane=ligaer&liga=L1')).not.toThrow();
    const li = raekke('Gift fra serveren');
    expect(within(li).getByText('Bot')).toBeInTheDocument();
    expect(within(li).getByTestId('avatar')).toHaveAttribute('data-emoji', '');
  });

  it('en forfalsket besked (uden system) får hverken dokumentets navn ELLER dokumentets emoji på avataren', () => {
    mockMessages.mockReturnValue({ loading: false, messages: [
      besked({ id: 'f9', uid: 'gaaet', displayName: 'Runde-Botten', avatarEmoji: '🤖', text: 'Falsk uden system' }),
    ] });
    setup('/spil/sl?fane=ligaer&liga=L1');
    const avatar = within(raekke('Falsk uden system')).getByTestId('avatar');
    expect(avatar).toHaveAttribute('data-emoji', '');
    expect(avatar).toHaveAttribute('data-name', '');
  });
});
