// Tests for GameScheduleTab — især status-vælgeren, der afgør om et spil står
// som "Afsluttet". Statussen har konsekvenser (spillet ryger ud af "Åbne spil",
// påmindelser stopper), så den må hverken skrives utilsigtet eller kunne sættes
// til en værdi, visningen ikke kender.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { createRequire } from 'module';

// Serverens EGEN afvisningstekst — ikke en kopi. Kopierede testen den, kunne
// beskeden på serveren ændres (eller tømmes), og fladens test stod grøn.
const { ukendtSportFejl } = createRequire(import.meta.url)('../../../functions-platform/gameScoring.js');

vi.mock('../../firebase', () => ({ db: {} }));

// useGames er en live-lytter — vi fodrer den direkte.
const mockGames = vi.fn();
vi.mock('../games/useGames', () => ({
  useGames: () => mockGames(),
}));

const mockSetGameSchedule = vi.fn();
const mockSetGameStatus = vi.fn();
const mockSetGameJoinable = vi.fn();
vi.mock('../games/gameActions', () => ({
  setGameSchedule: (...a) => mockSetGameSchedule(...a),
  setGameStatus: (...a) => mockSetGameStatus(...a),
  setGameJoinable: (...a) => mockSetGameJoinable(...a),
}));

const mockReprice = vi.fn();
const mockSyncKickoffs = vi.fn();
const mockSyncResults = vi.fn();
const mockSyncDetaljer = vi.fn();
const mockAfregn = vi.fn();
const mockBackfill = vi.fn().mockResolvedValue({ ok: true, data: {} });
vi.mock('./adminActions', () => ({
  callRecomputeGameScores: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  callBackfillPlayerLeagues: (...a) => mockBackfill(...a),
  callRepriceGameOdds: (...a) => mockReprice(...a),
  callSyncGameKickoffs: (...a) => mockSyncKickoffs(...a),
  callSyncGameResults: (...a) => mockSyncResults(...a),
  callSyncGameKampdetaljer: (...a) => mockSyncDetaljer(...a),
  callAfregnPuljeNu: (...a) => mockAfregn(...a),
  callSaetFacitManuelt: vi.fn(),
  callFrigivFacitTilSynk: vi.fn(),
  callOpretFaseKampe: vi.fn().mockResolvedValue({ ok: true, data: { status: { linjer: [], aabneDage: [], faser: [] }, nye: [], fejl: [], advarsler: [] } }),
  callRetFaseKampKickoff: vi.fn(),
}));

// Kamplisten til rundevælgeren hentes med getDocs — den hentes FØRST når
// ejeren beder om at vælge en runde, og attrappen skal kunne bevise begge dele.
const mockGetDocs = vi.fn();
vi.mock('firebase/firestore', () => ({
  collection: (...a) => ({ __sti: a.slice(1) }),
  getDocs: (...a) => mockGetDocs(...a),
}));

import GameScheduleTab, { byggSchedulePatch } from './GameScheduleTab';
import { HAANDBOLD_SPIL } from '../../test/faseKalender';

const TOUR = {
  id: 'tour2026', name: 'Tour de France 2026', emoji: '🚴',
  type: 'cycling', status: 'live', season: '2026',
};

// Det spil, synligheds-knappen er bygget til: et nyt fodboldspil, der er
// oprettet skjult og skal gennemgås, før det afsløres.
const PL = {
  id: 'pl2627-efteraar', name: 'Premier League 2026/27 — efterår', emoji: '⚽',
  type: 'football', status: 'open', season: '2026-27',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSetGameSchedule.mockResolvedValue({ ok: true });
  mockSetGameStatus.mockResolvedValue({ ok: true });
  mockSetGameJoinable.mockResolvedValue({ ok: true });
  mockGames.mockReturnValue({ games: [TOUR], loading: false });
});

/** Status-vælgeren for et spil. */
function statusSelect(name = TOUR.name) {
  return screen.getByLabelText(`Status for ${name}`);
}

describe('GameScheduleTab — status', () => {
  it('viser spillets nuværende status på dansk', () => {
    render(<GameScheduleTab />);
    expect(statusSelect().value).toBe('live');
    expect(screen.getByRole('option', { name: 'Afsluttet' })).toBeInTheDocument();
  });

  it('skriver den nye status når admin vælger Afsluttet og gemmer', async () => {
    render(<GameScheduleTab />);
    fireEvent.change(statusSelect(), { target: { value: 'finished' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    await waitFor(() => expect(mockSetGameStatus).toHaveBeenCalledWith('tour2026', 'finished'));
    expect(await screen.findByText('Gemt ✓')).toBeInTheDocument();
  });

  // Gem-knappen dækker både tidsplan og status. Et gem af en dato må ikke
  // skrive status igen — ellers ville hver gemning røre ved livscyklussen.
  it('rører ikke status når kun tidsplanen ændres', async () => {
    render(<GameScheduleTab />);
    fireEvent.change(screen.getByLabelText(/Spil-start/), { target: { value: '2026-07-04T12:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    await waitFor(() => expect(mockSetGameSchedule).toHaveBeenCalled());
    expect(mockSetGameStatus).not.toHaveBeenCalled();
  });

  // Omvendt: kommer man kun for at afslutte spillet, må gemningen ikke skrive
  // startAt igen. datetime-local har kun minut-præcision, så en blind skrivning
  // ville nulstille sekunderne på en dato, ingen havde rørt.
  it('rører ikke tidsplanen når kun status ændres', async () => {
    render(<GameScheduleTab />);
    fireEvent.change(statusSelect(), { target: { value: 'finished' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    await waitFor(() => expect(mockSetGameStatus).toHaveBeenCalledWith('tour2026', 'finished'));
    expect(mockSetGameSchedule).not.toHaveBeenCalled();
  });

  it('sender kun det ændrede dato-felt med', async () => {
    render(<GameScheduleTab />);
    fireEvent.change(screen.getByLabelText(/Spil-start/), { target: { value: '2026-07-04T12:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    await waitFor(() => expect(mockSetGameSchedule).toHaveBeenCalled());
    const [, patch] = mockSetGameSchedule.mock.calls[0];
    expect(Object.keys(patch)).toEqual(['startAt']);
  });

  it('forklarer hvad Afsluttet betyder, før der gemmes', () => {
    render(<GameScheduleTab />);
    fireEvent.change(statusSelect(), { target: { value: 'finished' } });
    expect(screen.getByText(/ikke flere påmindelser/i)).toBeInTheDocument();
  });

  // "Åbent" alene sætter ikke spillet på oversigten — synligheden gør. Sagde
  // hjælpen bare "Vises under Åbne spil — deltag", ville admin tro, at et
  // åbent spil er afsløret, og springe knappen over.
  it('siger ved "Åbent", at synligheden afgør om spillet vises', () => {
    render(<GameScheduleTab />);
    fireEvent.change(statusSelect(), { target: { value: 'open' } });
    expect(screen.getByText(/sat til Synligt/)).toBeInTheDocument();
  });

  it('viser fejlen fra serveren, hvis status ikke kunne gemmes', async () => {
    mockSetGameStatus.mockResolvedValue({ ok: false, error: 'Du har ikke adgang til denne handling.' });
    render(<GameScheduleTab />);
    fireEvent.change(statusSelect(), { target: { value: 'finished' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    expect(await screen.findByText(/ikke adgang/i)).toBeInTheDocument();
  });

  // Fejler tidsplanen, er det meningsløst at skrive status bagefter — så ville
  // halvdelen af gemningen være gået igennem uden at admin fik det at vide.
  it('springer status over, hvis tidsplanen fejlede', async () => {
    mockSetGameSchedule.mockResolvedValue({ ok: false, error: 'Kunne ikke gemme spillets tidsplan.' });
    render(<GameScheduleTab />);
    // Begge dele ændres, så tidsplanen faktisk skrives — og fejler.
    fireEvent.change(screen.getByLabelText(/Spil-start/), { target: { value: '2026-07-04T12:00' } });
    fireEvent.change(statusSelect(), { target: { value: 'finished' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    await waitFor(() => expect(mockSetGameSchedule).toHaveBeenCalled());
    expect(await screen.findByText(/tidsplan/i)).toBeInTheDocument();
    expect(mockSetGameStatus).not.toHaveBeenCalled();
  });

  // Spil-dokumentet skrives også af serveren (fx standings i kampvinduet).
  // Et ugemt valg må ikke blive nulstillet af sådan en snapshot — ellers
  // hopper vælgeren tilbage, uden at admin får besked.
  it('beholder et ugemt statusvalg når spillet opdateres udefra', () => {
    // Firestore-Timestamps er nye objekter ved hver snapshot — samme tidspunkt,
    // anden reference.
    const stamp = () => ({ toMillis: () => 1_700_000_000_000 });
    mockGames.mockReturnValue({ games: [{ ...TOUR, startAt: stamp() }], loading: false });
    const { rerender } = render(<GameScheduleTab />);
    fireEvent.change(statusSelect(), { target: { value: 'finished' } });

    // Serveren skriver noget andet på dokumentet; datoen er uændret.
    mockGames.mockReturnValue({
      games: [{ ...TOUR, startAt: stamp(), standings: ['ny'] }],
      loading: false,
    });
    rerender(<GameScheduleTab />);
    expect(statusSelect().value).toBe('finished');
  });

  it('tilbyder et tomt valg, når spillet slet ingen status har', () => {
    mockGames.mockReturnValue({ games: [{ ...TOUR, status: undefined }], loading: false });
    render(<GameScheduleTab />);
    expect(statusSelect().value).toBe('');
    expect(screen.getByRole('option', { name: '— ikke sat —' })).toBeInTheDocument();
  });
});

// --- Synlighed ------------------------------------------------------------
//
// Uden knappen bliver et nyt spil til i samme sekund, som alle kan se det:
// seed-scriptet skriver spillet, og står `joinable` til true, ligger det på
// forsiden, før nogen har set holdnavne, kickoff-tider og odds efter. Den
// eneste udvej var at markere spillet "Afsluttet" — usandt, og det stopper
// påmindelserne.
describe('synlighed', () => {
  // PL har intet joinable-felt → skjult. Sådan ser et spil ud, seedet lige har
  // oprettet med joinable: false.
  beforeEach(() => {
    mockGames.mockReturnValue({ games: [PL], loading: false });
  });

  const visKnap = () => screen.getByRole('button', { name: /Vis spillet/ });
  const skjulKnap = () => screen.getByRole('button', { name: /Skjul spillet/ });

  it('viser at et skjult spil er skjult, og tilbyder at vise det', () => {
    render(<GameScheduleTab />);
    expect(screen.getByText('Skjult')).toBeInTheDocument();
    expect(visKnap()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Skjul spillet/ })).not.toBeInTheDocument();
  });

  it('viser spillet med ét klik — joinable: true, intet andet', async () => {
    render(<GameScheduleTab />);
    fireEvent.click(visKnap());
    await waitFor(() => expect(mockSetGameJoinable).toHaveBeenCalledWith('pl2627-efteraar', true));
    // Synlighed er IKKE status. Skrev knappen også status, ville "vis spillet"
    // kunne genåbne et afsluttet spil — og "skjul" markere et spil afsluttet,
    // som aldrig er begyndt.
    expect(mockSetGameStatus).not.toHaveBeenCalled();
    expect(mockSetGameSchedule).not.toHaveBeenCalled();
  });

  it('skjuler et synligt spil igen — og siger hvad synligt betyder', async () => {
    mockGames.mockReturnValue({ games: [{ ...PL, joinable: true }], loading: false });
    render(<GameScheduleTab />);
    expect(screen.getByText('Synligt for spillerne')).toBeInTheDocument();
    // Den SYNLIGE gren af hjælpeteksten skal dræbes for sig. Uden denne
    // assertion kunne hele sætningen erstattes med en tom streng med grøn suite.
    expect(screen.getByText(/Åbne spil — deltag" og kan tilmeldes/)).toBeInTheDocument();
    fireEvent.click(skjulKnap());
    await waitFor(() => expect(mockSetGameJoinable).toHaveBeenCalledWith('pl2627-efteraar', false));
  });

  // Knappen skriver med det samme. Gem må derfor ikke også røre feltet —
  // ellers ville et gem af en dato kunne rulle synligheden tilbage til det,
  // fladen havde i hovedet.
  it('rører ikke synligheden når man gemmer tidsplanen', async () => {
    render(<GameScheduleTab />);
    fireEvent.change(screen.getByLabelText(/Spil-start/), { target: { value: '2026-08-21T20:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    await waitFor(() => expect(mockSetGameSchedule).toHaveBeenCalled());
    expect(mockSetGameJoinable).not.toHaveBeenCalled();
  });

  // Etiketten er den eneste kvittering. Følger den et lokalt valg i stedet for
  // spillet, ville en afvist skrivning se ud som om den var gået igennem.
  it('følger spillet, ikke klikket — etiketten vender først med snapshottet', async () => {
    const { rerender } = render(<GameScheduleTab />);
    fireEvent.click(visKnap());
    await waitFor(() => expect(mockSetGameJoinable).toHaveBeenCalled());
    expect(screen.getByText('Skjult')).toBeInTheDocument();
    mockGames.mockReturnValue({ games: [{ ...PL, joinable: true }], loading: false });
    rerender(<GameScheduleTab />);
    expect(screen.getByText('Synligt for spillerne')).toBeInTheDocument();
  });

  it('viser serverens fejl, hvis synligheden ikke kunne ændres', async () => {
    mockSetGameJoinable.mockResolvedValue({ ok: false, error: 'Du har ikke adgang til denne handling.' });
    render(<GameScheduleTab />);
    fireEvent.click(visKnap());
    expect(await screen.findByText(/ikke adgang/i)).toBeInTheDocument();
    expect(screen.getByText('Skjult')).toBeInTheDocument();
  });

  // HJÆLPETEKSTEN SKAL VÆRE SAND. Security Reviewer efterprøvede den mod
  // emulatoren: enhver godkendt bruger kan læse spil-dokumentet
  // (firestore.rules:604) og kampene (:721), useGames abonnerer på HELE
  // games-kollektionen, så der skal ikke engang et link til — og joinable
  // findes ikke ét sted i reglerne eller i functions, så den der åbner
  // /spil/{id} kan faktisk tilmelde sig. Lovede teksten mere, ville den være
  // en usandhed om adgang.
  it('lover ikke hemmeligholdelse, den ikke kan holde', () => {
    render(<GameScheduleTab />);
    const tekst = screen.getByText(/Skjult betyder KUN/);
    // HVEM der kan se det, er hele pointet. Uden dette kunne "enhver godkendt
    // bruger" laves om til "kun andre admins" med grøn suite.
    expect(tekst).toHaveTextContent(/enhver godkendt brugers spil-liste/);
    expect(tekst).toHaveTextContent(/kampene kan læses af alle godkendte/);
    expect(tekst).toHaveTextContent(/kender adressen kan tilmelde sig/);
    expect(tekst.textContent).not.toMatch(/kun du kan se|kun andre admins|ingen andre kan|utilgængelig/i);
  });

  // Linket alene rækker ikke: GamePage viser en ikke-tilmeldt KUN et
  // Deltag-kort — alle faner ligger i isMember-grenen. Teksten skal sige det,
  // ellers står ejeren med en Deltag-knap og tror, noget er gået galt.
  it('siger at gennemgangen kræver, at man tilmelder sig', () => {
    render(<GameScheduleTab />);
    const tekst = screen.getByText(/Skjult betyder KUN/);
    expect(tekst).toHaveTextContent(/\/spil\/pl2627-efteraar/);
    expect(tekst).toHaveTextContent(/tilmeld dig/);
    expect(tekst).toHaveTextContent(/ikke-tilmeldt ser kun et Deltag-kort/);
  });
});

// --- Synlighed: hvor knappen IKKE hører hjemme ----------------------------
//
// joinable læses kun af "åbne spil"-filteret i splitGames. På et eksternt og
// på et afsluttet spil gør feltet ingenting — og en knap, der lover en
// virkning, den ikke har, er værre end ingen knap: etiketten ville sige
// "Synligt for spillerne" om et spil, status-hjælpen to linjer længere oppe
// erklærer ude af oversigten.
describe('synlighed — spil hvor feltet intet gør', () => {
  const EKSTERN = { ...TOUR, status: 'live', externalUrl: 'https://tour.vejleaa.dk' };
  const AFSLUTTET = { ...PL, status: 'finished' };

  it('tilbyder ikke at skjule et eksternt spil', () => {
    mockGames.mockReturnValue({ games: [EKSTERN], loading: false });
    render(<GameScheduleTab />);
    expect(screen.queryByRole('button', { name: /Vis spillet|Skjul spillet/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Skjult')).not.toBeInTheDocument();
    expect(screen.getByText(/eksternt spil vises altid/i)).toBeInTheDocument();
  });

  it('tilbyder ikke at vise et afsluttet spil', () => {
    mockGames.mockReturnValue({ games: [AFSLUTTET], loading: false });
    render(<GameScheduleTab />);
    expect(screen.queryByRole('button', { name: /Vis spillet|Skjul spillet/ })).not.toBeInTheDocument();
    expect(screen.getByText(/afsluttet spil er altid ude af/i)).toBeInTheDocument();
  });

  // Et eksternt spil, der ER joinable, må stadig ikke få etiketten "Synligt
  // for spillerne" — det ville være sandt om feltet og falsk om oversigten.
  it('påstår ikke noget om et eksternt spil, der er joinable', () => {
    mockGames.mockReturnValue({ games: [{ ...EKSTERN, joinable: true }], loading: false });
    render(<GameScheduleTab />);
    expect(screen.queryByText('Synligt for spillerne')).not.toBeInTheDocument();
  });
});

// --- Ompris kampene -------------------------------------------------------
//
// Knappen skriver i produktionsdata på hver eneste ikke-låste kamps
// pointværdi, og der er ingen oddsHistory at rulle tilbage til. CLAUDE.md
// kræver tør-kørsel først, og den regel skal håndhæves af FLADEN — ikke kun
// af en default i callablen, som en fremtidig ændring kan vende.
describe('🗓️ Synk kamptider nu — vises for spil med kickoff-synk', () => {
  // Superligaen har en FAST puljeLockAt (intet puljeLockRound), men HAR en
  // kickoff-synk. Knappen var før gate't på puljeLockRound og forsvandt derfor
  // fra SL — så en flyttet SL-kamp kunne ikke hentes med vilje. Nu gates den på
  // harKickoffSynk (provideren), ikke på pulje-modellen.
  const SL_SYNK = {
    id: 'superliga2627', name: 'Superligaen 2026/27', emoji: '⚽',
    type: 'football', status: 'open', sync: { provider: 'superliga' },
    // BEVIDST intet puljeLockRound.
  };

  it('vises for Superligaen (kickoff-synk uden rundebaseret pulje-deadline)', () => {
    mockGames.mockReturnValue({ games: [SL_SYNK], loading: false });
    render(<GameScheduleTab />);
    expect(screen.getByRole('button', { name: /Synk kamptider nu/i })).toBeInTheDocument();
  });

  it('vises IKKE for et spil uden synk-provider (Touren)', () => {
    mockGames.mockReturnValue({ games: [TOUR], loading: false });
    render(<GameScheduleTab />);
    expect(screen.queryByRole('button', { name: /Synk kamptider nu/i })).not.toBeInTheDocument();
  });
});

describe('⬇️ Synk resultater nu — manuel udløsning af resultat-synken', () => {
  const SL_SYNK = {
    id: 'superliga2627', name: 'Superligaen 2026/27', emoji: '⚽',
    type: 'football', status: 'open', sync: { provider: 'superliga' },
  };
  const PL_SYNK = {
    id: 'pl2627-efteraar', name: 'Premier League 2026/27 — efterår', emoji: '⚽',
    type: 'football', status: 'open', sync: { provider: 'pulselive' },
  };

  const knap = () => screen.getByRole('button', { name: /Synk resultater nu/i });

  it('vises for begge synkede spil (superliga og pulselive)', () => {
    mockGames.mockReturnValue({ games: [SL_SYNK, PL_SYNK], loading: false });
    render(<GameScheduleTab />);
    expect(screen.getAllByRole('button', { name: /Synk resultater nu/i })).toHaveLength(2);
  });

  it('vises IKKE for et spil uden synk-provider (Touren)', () => {
    mockGames.mockReturnValue({ games: [TOUR], loading: false });
    render(<GameScheduleTab />);
    expect(screen.queryByRole('button', { name: /Synk resultater nu/i })).not.toBeInTheDocument();
  });

  // ALLOWLISTE-BEVISET i fladen: en provider, serveren ikke kender, ville få
  // knappen vist med en gate på !!sync.provider — og hvert klik kunne kun
  // fejle med invalid-argument. Muteres harResultatSynk til en sandheds-gate,
  // bliver denne rød.
  it('vises IKKE for et spil med en endnu ikke implementeret provider', () => {
    mockGames.mockReturnValue({
      games: [{ ...SL_SYNK, id: 'nyt-spil', name: 'Nyt spil', sync: { provider: 'endnu-ikke-bygget' } }],
      loading: false,
    });
    render(<GameScheduleTab />);
    expect(screen.queryByRole('button', { name: /Synk resultater nu/i })).not.toBeInTheDocument();
  });

  it('kalder ikke serveren uden bekræftelse — og confirm-teksten navngiver konsekvenserne', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockGames.mockReturnValue({ games: [SL_SYNK], loading: false });
    render(<GameScheduleTab />);
    fireEvent.click(knap());
    await waitFor(() => expect(bekraeft).toHaveBeenCalled());
    // Annuller = intet kald. Fjernes confirm-vagten, bliver denne rød.
    expect(mockSyncResults).not.toHaveBeenCalled();

    // Indholdet, ikke kun eksistensen: point/Elo flytter sig, og Runde-Bottens
    // opslag lander NU — den eneste ikke-idempotente bivirkning, og den man
    // skal kende, før man trykker kl. 03.14.
    const tekst = bekraeft.mock.calls[0][0];
    expect(tekst).toMatch(/afregner point/);
    expect(tekst).toMatch(/Runde-Botten/);
    expect(tekst).toMatch(/NU/);
    // Og den må ikke skræmme med falsk uigenkaldelighed: synken gør det samme
    // som automatikken — teksten skal sige det.
    expect(tekst).toMatch(/automatiske synk/);
    bekraeft.mockRestore();
  });

  it('synker spillet efter bekræftelse og navngiver de rettede kampe', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockSyncResults.mockResolvedValue({
      ok: true,
      data: { gameId: 'superliga2627', checked: 12, updated: 2, rettede: ['sl-a', 'sl-b'], standings: { rows: 12, changed: true } },
    });
    mockGames.mockReturnValue({ games: [SL_SYNK], loading: false });
    render(<GameScheduleTab />);
    fireEvent.click(knap());
    await waitFor(() => expect(mockSyncResults).toHaveBeenCalledWith('superliga2627'));
    // Begge kamp-id'er skal stå i kvitteringen — tallet alene beviser intet.
    await waitFor(() => expect(screen.getByText(/2 kampe fik nyt facit/)).toBeInTheDocument());
    expect(screen.getByText(/sl-a, sl-b/)).toBeInTheDocument();
    expect(screen.getByText(/12 hold, opdateret/)).toBeInTheDocument();
    // Fremrykningen af bot-opslaget skal stå i kvitteringen, ikke kun i confirm.
    expect(screen.getByText(/Runde-Botten på liga-væggene nu/)).toBeInTheDocument();
    bekraeft.mockRestore();
  });

  // Alarm-scenariet: sweep'et har netop selv skannet hele sæsonen, så knappen
  // finder som regel intet — og "intet manglede" alene ville være en blindgyde.
  // Rapporten skal pege på næste skridt (hånd-vejen) og må IKKE påstå et facit.
  it('siger ved 0 opdaterede, hvad næste skridt er — og påstår ikke et facit', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockSyncResults.mockResolvedValue({
      ok: true,
      data: { gameId: 'superliga2627', checked: 12, updated: 0, rettede: [], standings: { rows: 12, changed: false } },
    });
    mockGames.mockReturnValue({ games: [SL_SYNK], loading: false });
    render(<GameScheduleTab />);
    fireEvent.click(knap());
    await waitFor(() => expect(screen.getByText(/Intet manglede/)).toBeInTheDocument());
    // Næste skridt er KNAPPEN lige nedenfor — ikke en guide, der beskrev en
    // vej, som kun gik gennem Firebase-konsollen.
    expect(screen.getByText(/brug ✍️ Sæt eller ret facit i hånden nedenfor/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sæt eller ret facit i hånden/ })).toBeInTheDocument();
    expect(screen.queryByText(/admin-guiden/)).not.toBeInTheDocument();
    expect(screen.queryByText(/fik nyt facit/)).not.toBeInTheDocument();
    // Ingen manuelle kampe → ingen sætning om dem (støj en almindelig dag).
    expect(screen.queryByText(/sat i hånden og røres ikke/)).not.toBeInTheDocument();
    bekraeft.mockRestore();
  });

  it('nævner kampe sat i hånden — og hvilke kilden er uenig om', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockSyncResults.mockResolvedValue({
      ok: true,
      data: {
        gameId: 'superliga2627', checked: 12, updated: 0, rettede: [],
        manuelle: ['r4-a', 'r5-b'],
        manuelleUenige: [{ id: 'r5-b', home: 'AGF', away: 'OB', haand: { home: 1, away: 1 }, kilde: { home: 2, away: 1 } }],
        standings: { rows: 12, changed: false },
      },
    });
    mockGames.mockReturnValue({ games: [SL_SYNK], loading: false });
    render(<GameScheduleTab />);
    fireEvent.click(knap());
    // Holdnavne og BEGGE stillinger — ikke dokument-id'et.
    const linje = await screen.findByText(/2 kampe er sat i hånden og røres ikke af synken/);
    expect(linje.textContent).toContain('— kilden siger noget andet om 1: AGF – OB (i hånden 1-1, kilden 2-1).');
    expect(linje.textContent).not.toMatch(/r5-b|\[object Object\]/);
    bekraeft.mockRestore();
  });

  // Ental: "1 kamp", aldrig "1 kampe" — samme bøjning som Drift-kortets
  // linje om de samme kampe (facitVagt.meldManuelleUenige).
  it('bøjer ental ved én kamp sat i hånden og ét nyt facit', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockSyncResults.mockResolvedValue({
      ok: true,
      data: {
        gameId: 'superliga2627', checked: 12, updated: 1, rettede: ['sl-a'],
        manuelle: ['r4-a'], manuelleUenige: [],
        standings: { rows: 12, changed: false },
      },
    });
    mockGames.mockReturnValue({ games: [SL_SYNK], loading: false });
    render(<GameScheduleTab />);
    fireEvent.click(knap());
    const linje = await screen.findByText(/fik nyt facit/);
    expect(linje.textContent).toMatch(/^1 kamp fik nyt facit: sl-a\./);
    expect(linje.textContent).toContain(' 1 kamp er sat i hånden og røres ikke af synken.');
    expect(linje.textContent).not.toMatch(/1 kampe/);
    bekraeft.mockRestore();
  });

  it('bøjer flertal ved to', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockSyncResults.mockResolvedValue({
      ok: true,
      data: {
        gameId: 'superliga2627', checked: 12, updated: 2, rettede: ['sl-a', 'sl-b'],
        manuelle: ['r4-a', 'r5-b'], manuelleUenige: [],
        standings: { rows: 12, changed: false },
      },
    });
    mockGames.mockReturnValue({ games: [SL_SYNK], loading: false });
    render(<GameScheduleTab />);
    fireEvent.click(knap());
    const linje = await screen.findByText(/fik nyt facit/);
    expect(linje.textContent).toMatch(/^2 kampe fik nyt facit: sl-a, sl-b\./);
    expect(linje.textContent).toContain(' 2 kampe er sat i hånden og røres ikke af synken.');
    bekraeft.mockRestore();
  });

  it('viser serverens fejl, når synken fejler', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockSyncResults.mockResolvedValue({ ok: false, error: 'Ingen synk-provider for "superliga2627".' });
    mockGames.mockReturnValue({ games: [SL_SYNK], loading: false });
    render(<GameScheduleTab />);
    fireEvent.click(knap());
    await waitFor(() => expect(screen.getByText(/Ingen synk-provider/)).toBeInTheDocument());
    bekraeft.mockRestore();
  });
});

describe('ompris kampene', () => {
  const SL = { id: 'sl2627', name: 'Superligaen', emoji: '⚽', type: 'football', status: 'live' };
  const PLAN = {
    ok: true,
    data: {
      updated: 2,
      dryRun: true,
      aendringer: [
        { id: 'a', round: 4, home: 'Lyngby', away: 'FCM', kickoff: Date.UTC(2026, 7, 16, 14, 0), foer: { 1: 4.48, X: 6, 2: 1.55 }, efter: { 1: 4.61, X: 6.38, 2: 1.6 } },
        { id: 'b', round: 4, home: 'Randers', away: 'FCK', kickoff: Date.UTC(2026, 7, 16, 16, 0), foer: { 1: 3.6, X: 6, 2: 1.75 }, efter: { 1: 3.72, X: 5.6, 2: 1.81 } },
      ],
    },
  };

  beforeEach(() => {
    mockGames.mockReturnValue({ games: [SL], loading: false });
    mockReprice.mockResolvedValue(PLAN);
  });

  const toerKnap = () => screen.getByRole('button', { name: /Ompris kampene/i });

  // Odds og Elo findes kun i fodboldspillene. Blev knappen vist på Touren,
  // ville den kalde en callable, der intet har at ompris — og en admin ville
  // tro, den bare ikke virkede.
  it('vises kun for fodboldspil', () => {
    const { unmount } = render(<GameScheduleTab />);
    expect(toerKnap()).toBeInTheDocument();
    unmount();
    mockGames.mockReturnValue({ games: [TOUR], loading: false });
    render(<GameScheduleTab />);
    expect(screen.queryByRole('button', { name: /Ompris kampene/i })).not.toBeInTheDocument();
  });

  it('tørkører FØRST — og skrive-knappen findes ikke før man har set planen', async () => {
    render(<GameScheduleTab />);
    // Før tør-kørslen er der intet at skrive.
    expect(screen.queryByRole('button', { name: /Skriv de/i })).not.toBeInTheDocument();
    fireEvent.click(toerKnap());
    await waitFor(() => expect(mockReprice).toHaveBeenCalled());
    // Det FØRSTE kald SKAL være en tør-kørsel.
    expect(mockReprice).toHaveBeenCalledWith({ gameId: 'sl2627', dryRun: true });
    // Nu — og først nu — findes skrive-knappen.
    await waitFor(() => expect(screen.getByRole('button', { name: /Skriv de 2 ændringer/i })).toBeInTheDocument());
  });

  // Testen hed før det samme, men asserterede KUN efter-værdier — før-kolonnen
  // blev aldrig efterprøvet, og holdnavnene kunne byttes om, uden at noget
  // blev rødt. Nu bindes før OG efter til den RÆKKE, de hører til.
  it('viser før og efter i samme række, så ændringen kan ses inden den skrives', async () => {
    render(<GameScheduleTab />);
    fireEvent.click(toerKnap());
    await waitFor(() => expect(screen.getByText(/Lyngby/)).toBeInTheDocument());
    const raekke = (navn) => screen.getAllByRole('row').find((r) => r.textContent.includes(navn));

    // Lyngby: uafgjort STIGER over 6 — beviser at loftet er væk.
    const lyngby = raekke('Lyngby');
    expect(lyngby.textContent).toMatch(/4,48 \/ 6,00 \/ 1,55/);   // før
    expect(lyngby.textContent).toMatch(/4,61 \/ 6,38 \/ 1,60/);   // efter
    expect(lyngby.textContent).toMatch(/Lyngby – FCM/);           // rækkefølgen hjemme–ude

    // Randers: uafgjort FALDER under 6 — kan kun komme fra uafgjort-modellen,
    // for et loft kan kun trække ned TIL 6, aldrig under.
    const randers = raekke('Randers');
    expect(randers.textContent).toMatch(/3,60 \/ 6,00 \/ 1,75/);
    expect(randers.textContent).toMatch(/3,72 \/ 5,60 \/ 1,81/);
    expect(randers.textContent).toMatch(/Randers – FCK/);
  });

  // Kickoff er det, beslutningen hænger på: er kampen i aften med på listen?
  it('viser hvornår hver kamp spilles', async () => {
    render(<GameScheduleTab />);
    fireEvent.click(toerKnap());
    await waitFor(() => expect(screen.getByText(/Lyngby/)).toBeInTheDocument());
    const lyngby = screen.getAllByRole('row').find((r) => r.textContent.includes('Lyngby'));
    // Uden datoen kan admin ikke se, om aftenens kamp er med på listen.
    // Kolonnen viste '—' i første udgave, fordi kickoff aldrig blev sendt med.
    expect(lyngby.textContent).toMatch(/16\.|aug/i);
    expect(lyngby.textContent).not.toMatch(/Spilles—/);
  });

  it('skriver ikke uden bekræftelse — og advarslen siger det, den skal', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<GameScheduleTab />);
    fireEvent.click(toerKnap());
    await waitFor(() => screen.getByRole('button', { name: /Skriv de 2/i }));
    mockReprice.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Skriv de 2/i }));
    await waitFor(() => expect(bekraeft).toHaveBeenCalled());
    expect(mockReprice).not.toHaveBeenCalled();

    // Testen beviste før KUN at confirm blev konsulteret, ikke hvad den sagde
    // — hele teksten kunne erstattes med 'OK?' med grøn suite. De tre ting,
    // der SKAL stå, før nogen trykker på noget uigenkaldeligt:
    const tekst = bekraeft.mock.calls[0][0];
    expect(tekst).toMatch(/2 kampe/);                         // omfanget
    expect(tekst).toMatch(/afregnes til de NYE odds/);        // konsekvensen
    expect(tekst).toMatch(/oddsHistory/);                     // uigenkaldeligheden
    // Og den må IKKE påstå, at point er upåvirkede — det var den forkerte
    // sætning, der stod her: allerede afgivne tips afregnes til de nye odds.
    expect(tekst).not.toMatch(/Point ændres ikke\./);
    bekraeft.mockRestore();
  });

  // En fejlet skrivning må ikke se ud som en succes. Mutant: fjern res.ok-grenen
  // → admin ser "2 kampe har fået nye odds", planen forsvinder, og der er
  // ingen oddsHistory at tjekke imod.
  it('viser fejlen når skrivningen fejler — og beholder planen', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<GameScheduleTab />);
    fireEvent.click(toerKnap());
    await waitFor(() => screen.getByRole('button', { name: /Skriv de 2/i }));
    mockReprice.mockResolvedValue({ ok: false, error: 'Du har ikke adgang til denne handling.' });
    fireEvent.click(screen.getByRole('button', { name: /Skriv de 2/i }));
    await waitFor(() => expect(screen.getByText(/ikke adgang/i)).toBeInTheDocument());
    // … og fejlen står RØDT, ikke grønt (mutant: kind 'err' → 'ok' på skrive-stien
    // overlevede, så en fejlet skrivning kunne ligne en succes).
    expect(screen.getByText(/ikke adgang/i).className).toMatch(/badge--red/);
    expect(screen.getByText(/ikke adgang/i).className).not.toMatch(/badge--green/);
    // Planen SKAL blive stående — ellers har admin hverken skrevet noget eller
    // fået lov at beholde det, han lige har set.
    expect(screen.getByRole('button', { name: /Skriv de 2/i })).toBeInTheDocument();
    bekraeft.mockRestore();
  });

  it('viser fejlen når tør-kørslen fejler', async () => {
    mockReprice.mockResolvedValue({ ok: false, error: 'Spillet "xx" findes ikke.' });
    render(<GameScheduleTab />);
    fireEvent.click(toerKnap());
    await waitFor(() => expect(screen.getByText(/findes ikke/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Skriv de/i })).not.toBeInTheDocument();
  });

  // updated tælles ENS i tør og våd tilstand. Svarer serveren dryRun: true på
  // et skrive-kald, er der intet skrevet — og admin må ikke få at vide, at der
  // er.
  it('melder FEJL, hvis serveren tørkørte på et skrive-kald', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<GameScheduleTab />);
    fireEvent.click(toerKnap());
    await waitFor(() => screen.getByRole('button', { name: /Skriv de 2/i }));
    mockReprice.mockResolvedValue({ ok: true, data: { updated: 2, dryRun: true, aendringer: [] } });
    fireEvent.click(screen.getByRole('button', { name: /Skriv de 2/i }));
    await waitFor(() => expect(screen.getByText(/skrev INTET/i)).toBeInTheDocument());
    bekraeft.mockRestore();
  });

  it('sender dryRun: false, når man bekræfter', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<GameScheduleTab />);
    fireEvent.click(toerKnap());
    await waitFor(() => screen.getByRole('button', { name: /Skriv de 2/i }));
    mockReprice.mockResolvedValue({ ok: true, data: { updated: 2, dryRun: false, aendringer: [] } });
    fireEvent.click(screen.getByRole('button', { name: /Skriv de 2/i }));
    await waitFor(() => expect(mockReprice).toHaveBeenLastCalledWith({ gameId: 'sl2627', dryRun: false }));
    // Skrive-knappen forsvinder, så man ikke kan trykke to gange på et nu
    // forældet grundlag …
    await waitFor(() => expect(screen.queryByRole('button', { name: /Skriv de/i })).not.toBeInTheDocument());
    // … men TABELLEN bliver stående. Den er det eneste spor af, hvad
    // før-oddsene var: der er ingen oddsHistory, og lukker admin fanen, findes
    // de gamle priser kun i Cloud-loggen.
    expect(screen.getByText(/Lyngby/)).toBeInTheDocument();
    expect(screen.getByText(/kvitteringen/i)).toBeInTheDocument();
    bekraeft.mockRestore();
  });

  // Et SAT, men ukendt game.sport ('handbold'): før gav tør-kørslen
  // fodboldens odds tilbage, som om de var rigtige, og fladen viste dem — eller
  // "allerede i takt" ved 0 ændringer. Nu afviser callablen (failed-
  // precondition), og fladen skal vise SERVERENS besked rødt — ikke en succes,
  // ikke en plan og ikke en skrive-knap.
  it('viser serverens afvisning af et ukendt sport rødt — og ingen plan, ingen succes', async () => {
    const besked = ukendtSportFejl('vm-haandbold', 'handbold').message;
    mockReprice.mockResolvedValue({ ok: false, error: besked });
    render(<GameScheduleTab />);
    fireEvent.click(toerKnap());
    const badge = await screen.findByText(/ikke er en kendt sport/);
    expect(badge.textContent).toBe(besked);
    expect(badge.textContent).toContain('"handbold"');
    expect(badge.textContent).toMatch(/IKKE omprist/);
    expect(badge.className).toMatch(/badge--red/);
    expect(badge.className).not.toMatch(/badge--green/);
    expect(screen.queryByText(/allerede i takt/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/kampe ville få nye odds/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Skriv de/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('siger det tydeligt, når intet ville ændre sig', async () => {
    mockReprice.mockResolvedValue({ ok: true, data: { updated: 0, dryRun: true, aendringer: [] } });
    render(<GameScheduleTab />);
    fireEvent.click(toerKnap());
    await waitFor(() => expect(screen.getByText(/allerede i takt med modellen/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Skriv de/i })).not.toBeInTheDocument();
  });
});


// ---------------------------------------------------------------------------
// STARTRUNDEN — DEN, DER GATER.
//
// Gaten var en dato, og en dato kan skære en runde midt over: Superligaens
// runde 3 spilles 7.-10. august bortset fra to kampe den 2.-3. september.
// Feltet her er det eneste sted, en ejer kan sætte runden — uden det ville
// `startRound` være maskineri, ingen kunne komme til.
// ---------------------------------------------------------------------------
describe('startrunde-vælgeren', () => {
  const SPIL = {
    id: 'sl', name: 'Superligaen', emoji: '⚽', type: 'football', status: 'live',
    startAt: Date.parse('2026-08-01T15:59:00Z'),
  };
  const KAMPE = [
    { id: 'r1a', round: 1, kickoff: Date.parse('2026-07-24T17:00:00Z') },
    { id: 'r2a', round: 2, kickoff: Date.parse('2026-08-01T16:00:00Z') },
    { id: 'r3a', round: 3, kickoff: Date.parse('2026-08-07T17:00:00Z') },
    // Den udsatte — runde 3 rækker helt ind i september.
    { id: 'r3f', round: 3, kickoff: Date.parse('2026-09-03T16:00:00Z') },
  ];

  beforeEach(() => {
    mockGames.mockReturnValue({ games: [SPIL], loading: false });
    mockSetGameSchedule.mockResolvedValue({ ok: true });
    mockSetGameStatus.mockResolvedValue({ ok: true });
    mockGetDocs.mockResolvedValue({ docs: KAMPE.map((m) => ({ id: m.id, data: () => m })) });
  });

  // BÆRENDE. Fanen viser alle spil på én gang, og Superligaen alene har 132
  // kampe. Hentedes listen ved render, ville et besøg for at skifte en status
  // koste hundredvis af læsninger.
  it('henter IKKE kampene, før nogen vil vælge en runde', () => {
    render(<GameScheduleTab />);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('viser spillets runder med deres spænd, når man åbner vælgeren', async () => {
    render(<GameScheduleTab />);
    fireEvent.click(screen.getByRole('button', { name: /vælg runde/i }));
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
    // Runde 3 spænder over mere end en uge — og det SKAL kunne ses, for det er
    // hele grunden til, at gaten tæller runder og ikke dage.
    const r3 = await screen.findByRole('option', { name: /Runde 3/ });
    expect(r3.textContent).toMatch(/aug/);
    expect(r3.textContent).toMatch(/sep/);
  });

  it('viser hvilken runde den gamle startdato svarer til', async () => {
    render(<GameScheduleTab />);
    fireEvent.click(screen.getByRole('button', { name: /vælg runde/i }));
    // startAt 15:59 UTC, runde 2 begynder 16:00 UTC — ét minut efter.
    const standard = await screen.findByRole('option', { name: /Udled af startdatoen/ });
    // Præcis — uden kalender er teksten den, den altid har været.
    expect(standard.textContent).toBe('– Udled af startdatoen (runde 2) –');
    expect(document.body.textContent).toContain('Runder FØR den valgte giver ingen point');
  });

  it('gemmer den valgte runde som et TAL', async () => {
    render(<GameScheduleTab />);
    fireEvent.click(screen.getByRole('button', { name: /vælg runde/i }));
    const vaelger = await screen.findByLabelText('Startrunde for Superligaen');
    fireEvent.change(vaelger, { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    await waitFor(() => expect(mockSetGameSchedule).toHaveBeenCalled());
    const [id, patch] = mockSetGameSchedule.mock.calls[0];
    expect(id).toBe('sl');
    // Et TAL, ikke strengen '3'. `m.round` er et tal, og en streng ville
    // aldrig matche — gaten ville stille holde op med at virke.
    expect(patch.startRound).toBe(3);
    expect(typeof patch.startRound).toBe('number');
  });

  it('rører ikke runden, når man kun kom for at skifte status', async () => {
    render(<GameScheduleTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    await waitFor(() => expect(mockSetGameStatus.mock.calls.length + mockSetGameSchedule.mock.calls.length)
      .toBeGreaterThanOrEqual(0));
    for (const [, patch] of mockSetGameSchedule.mock.calls) {
      expect(patch).not.toHaveProperty('startRound');
    }
  });

  // RUNDE 0 ER `groupByRound`s POSE til kampe UDEN rundenummer. Gaten rører
  // dem aldrig (`foerStart` gater kun kampe med et tal), så "Runde 0" i
  // vælgeren ville være et valg, der ikke gør noget.
  it('tilbyder ikke runde 0 — posen for kampe uden rundenummer', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [...KAMPE, { id: 'x', kickoff: Date.parse('2026-08-05T17:00:00Z') }]
        .map((m) => ({ id: m.id, data: () => m })),
    });
    render(<GameScheduleTab />);
    fireEvent.click(screen.getByRole('button', { name: /vælg runde/i }));
    await screen.findByRole('option', { name: /Runde 1/ });
    expect(screen.queryByRole('option', { name: /Runde 0/ })).toBeNull();
  });

  // FORTRYDELSE ER IKKE NEUTRAL. Rydder ejeren runden, falder spillet tilbage
  // på dato-gaten — netop den, der kan skære en runde over. Knappen skal sige
  // det, ikke bare stå tom.
  it('siger at datoen overtager, når runden ikke er sat', () => {
    render(<GameScheduleTab />);
    const knap = screen.getByRole('button', { name: /vælg runde/i });
    expect(knap.textContent).toMatch(/Udledes af datoen/);
  });

  it('kan rydde runden igen', async () => {
    mockGames.mockReturnValue({ games: [{ ...SPIL, startRound: 3 }], loading: false });
    render(<GameScheduleTab />);
    fireEvent.click(screen.getByRole('button', { name: /Runde 3 — skift/ }));
    const vaelger = await screen.findByLabelText('Startrunde for Superligaen');
    fireEvent.change(vaelger, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    await waitFor(() => expect(mockSetGameSchedule).toHaveBeenCalled());
    expect(mockSetGameSchedule.mock.calls[0][1].startRound).toBeNull();
  });

  // Fasekalender (delopgave 5): vælgeren og knappen bærer dagens navn, så
  // ejeren kan se, at «3» er den indledende rundes tredje dag.
  it('viser dagens navn i en turnering med fasekalender', async () => {
    const faser = [
      { navn: 'Indledende runde', fra: 1, til: 2, start: '2026-08-01' },
      { navn: 'Hovedrunde', bestemt: 'Hovedrunden', fra: 3, til: 4, start: '2026-08-07' },
    ];
    mockGames.mockReturnValue({ games: [{ ...SPIL, faser, startRound: 3 }], loading: false });
    render(<GameScheduleTab />);
    fireEvent.click(screen.getByRole('button', { name: /Hovedrunde · dag 1 — skift/ }));
    const r3 = await screen.findByRole('option', { name: /^Hovedrunde · dag 1 · / });
    expect(r3.textContent).toMatch(/aug/);
    expect(screen.getByRole('option', { name: /^Indledende runde · dag 1 · / })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^Runde \d/ })).toBeNull();
    // Første valg bærer SAMME etiket som resten (modstanderens fund 6) —
    // ikke «runde 2» over «Indledende runde · dag 2».
    const standard = screen.getByRole('option', { name: /Udled af startdatoen/ });
    expect(standard.textContent).toBe('– Udled af startdatoen (Indledende runde · dag 2) –');
    expect(standard.textContent).not.toMatch(/runde 2\)/);
    expect(document.body.textContent).toContain('Dage FØR den valgte giver ingen point');
    expect(document.body.textContent).not.toContain('Runder FØR');
  });

  // EN UGYLDIG KALENDER SLÅR FRA — MEN IKKE TAVST (modstanderens fund 2).
  it('viser admin, at fasekalenderen er ugyldig — og hvad det betyder', () => {
    const faser = [{ navn: 'Indledende runde', fra: 2, til: 3, start: '2026-08-01' }];
    mockGames.mockReturnValue({ games: [{ ...SPIL, faser }], loading: false });
    render(<GameScheduleTab />);
    const linje = screen.getByTestId('fasekalender-ugyldig');
    expect(linje.textContent).toBe('⚠️ Fasekalenderen er ugyldig: fase 1: første fase skal starte i runde 1 (ikke 2). '
      + 'Spillet vises med «Runde N» i stedet for dagens navn, Runde-Botten ser ikke de kommende faser, '
      + 'og ✍️ facit i hånden kender ingen knockout-kampe (intet slutresultat efter forlængelse). '
      + 'Ret faser i scripts/games.mjs og kør Deploy platform med seedGames — først som tør-kørsel, så med seedGamesSkriv.');
  });

  it('ingen kalender-linje for et spil uden faser — eller med en gyldig kalender', () => {
    const gyldig = [{ navn: 'Indledende runde', fra: 1, til: 2, start: '2026-08-01' }];
    mockGames.mockReturnValue({ games: [SPIL, { ...SPIL, id: 'hb', name: 'HB', faser: gyldig }], loading: false });
    render(<GameScheduleTab />);
    expect(screen.queryByTestId('fasekalender-ugyldig')).toBeNull();
    expect(document.body.textContent).not.toContain('Fasekalenderen er ugyldig');
  });
});

// --- Rundebaseret pulje-deadline + 🗓️ Synk kamptider nu --------------------
//
// For et spil med puljeLockRound UDLEDES puljeLockAt af kickoff-synken.
// Deadline-feltet må derfor ikke være redigerbart (en håndsat værdi
// overskrives, og en for tidlig placeholder låser genåbnings-forbuddet), og
// der SKAL findes en knap til at udløse synken med vilje — ellers står puljen
// "Endnu ikke åbnet", til det daglige job kører af sig selv.
describe('rundebaseret pulje-deadline', () => {
  const PLPULJE = {
    id: 'pl2627-efteraar', name: 'Premier League', emoji: '⚽',
    type: 'football', status: 'open', sync: { provider: 'pulselive' },
    pulje: { poolSize: 4, nedSize: 3 }, puljeLockRound: 3,
  };
  // Superligaen: pulje MEN fast dato (ingen puljeLockRound) — deadline-feltet
  // skal blive ved med at være redigerbart. Den HAR en kickoff-synk (superliga-
  // provider), så synk-knappen dukker op; men da der intet puljeLockRound er,
  // sætter synken IKKE puljeLockAt (kun kamptiderne). De to ting er uafhængige.
  const SL = {
    id: 'superliga2627', name: 'Superligaen', emoji: '⚽', type: 'football', status: 'live',
    sync: { provider: 'superliga' },
    pulje: { poolSize: 6 }, puljeLockAt: { toMillis: () => Date.parse('2026-09-01T12:00:00Z') },
  };
  const KO = Date.parse('2026-09-04T18:00:00Z');

  beforeEach(() => {
    mockGames.mockReturnValue({ games: [PLPULJE], loading: false });
    mockSyncKickoffs.mockResolvedValue({
      ok: true, data: { dryRun: true, aendringer: [], puljeLock: { runde: 3, tilMs: KO } },
    });
  });

  const synkKnap = () => screen.getByRole('button', { name: /Synk kamptider nu/i });

  it('viser pulje-deadlinen som OPLYSNING, ikke som redigerbart input', () => {
    render(<GameScheduleTab />);
    // Uden kalender PRÆCIS som før: «runde 3» med lille r.
    expect(screen.getByText(/\(udledt af runde 3\)/)).toBeInTheDocument();
    expect(screen.getByText(/udledes automatisk til rundens tidligste/i)).toBeInTheDocument();
    // Ingen redigerbar deadline: det rene felt-navn hører kun til det manuelle input.
    expect(screen.queryByText('🎖️ Bonus-/pulje-deadline')).not.toBeInTheDocument();
  });

  it('siger "Endnu ikke sat", når deadlinen endnu ikke er udledt', () => {
    render(<GameScheduleTab />); // PLPULJE har ingen puljeLockAt
    expect(screen.getByText(/Endnu ikke sat/i)).toBeInTheDocument();
  });

  it('et Gem skriver ALDRIG puljeLockAt for et runde-spil', async () => {
    render(<GameScheduleTab />);
    fireEvent.change(screen.getByLabelText(/Spil-start/), { target: { value: '2026-08-14T12:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    await waitFor(() => expect(mockSetGameSchedule).toHaveBeenCalled());
    for (const [, patch] of mockSetGameSchedule.mock.calls) {
      expect(patch).not.toHaveProperty('puljeLockAt');
    }
  });

  it('tørkører FØRST — skrive-knappen findes ikke, før planen er set', async () => {
    render(<GameScheduleTab />);
    expect(screen.queryByRole('button', { name: /^Skriv$/ })).not.toBeInTheDocument();
    fireEvent.click(synkKnap());
    await waitFor(() => expect(mockSyncKickoffs).toHaveBeenCalledWith({ gameId: 'pl2627-efteraar', dryRun: true }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Skriv$/ })).toBeInTheDocument());
    expect(screen.getByText(/pulje-deadlinen \(runde 3\) ville blive sat/i)).toBeInTheDocument();
  });

  it('sender dryRun: false ved Skriv, og melder den udledte deadline', async () => {
    render(<GameScheduleTab />);
    fireEvent.click(synkKnap());
    await waitFor(() => screen.getByRole('button', { name: /^Skriv$/ }));
    mockSyncKickoffs.mockResolvedValue({
      ok: true, data: { dryRun: false, aendringer: [{ id: 'a' }], puljeLock: { runde: 3, tilMs: KO } },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Skriv$/ }));
    await waitFor(() => expect(mockSyncKickoffs).toHaveBeenLastCalledWith({ gameId: 'pl2627-efteraar', dryRun: false }));
    expect(await screen.findByText(/pulje-deadlinen \(runde 3\) sat til/i)).toBeInTheDocument();
  });

  // updated/aendringer tælles ens i tør og våd tilstand — svarer serveren
  // dryRun:true på et skrive-kald, er intet skrevet, og admin må ikke tro andet.
  it('melder FEJL, hvis serveren tørkørte på et skrive-kald', async () => {
    render(<GameScheduleTab />);
    fireEvent.click(synkKnap());
    await waitFor(() => screen.getByRole('button', { name: /^Skriv$/ }));
    mockSyncKickoffs.mockResolvedValue({ ok: true, data: { dryRun: true, aendringer: [] } });
    fireEvent.click(screen.getByRole('button', { name: /^Skriv$/ }));
    await waitFor(() => expect(screen.getByText(/skrev INTET/i)).toBeInTheDocument());
  });

  // En grøn no-op må ikke ligne en fuldført deadline-sætning: har runden endnu
  // ingen kampe (puljeLockFraRunde → null), returnerer serveren hverken
  // puljeLock eller puljeLockAfvist, og teksten skal SIGE hvorfor (QC-fund).
  it('forklarer, når deadlinen endnu ikke kan udledes (runden har ingen kampe)', async () => {
    mockSyncKickoffs.mockResolvedValue({ ok: true, data: { dryRun: true, aendringer: [] } });
    render(<GameScheduleTab />);
    fireEvent.click(synkKnap());
    await waitFor(() => expect(screen.getByText(/kunne endnu ikke udledes — runde 3 har ingen kampe/i)).toBeInTheDocument());
  });

  it('advarer, når genåbnings-forbuddet afviste deadlinen', async () => {
    mockSyncKickoffs.mockResolvedValue({
      ok: true, data: { dryRun: true, aendringer: [], puljeLockAfvist: { runde: 3 } },
    });
    render(<GameScheduleTab />);
    fireEvent.click(synkKnap());
    await waitFor(() => expect(screen.getByText(/kunne IKKE sættes/i)).toBeInTheDocument());
  });

  it('for Superligaen (fast dato MEN kickoff-synk): synk-knappen VISES, og deadline-feltet er redigerbart', () => {
    // De to egenskaber er uafhængige: knappen følger kickoff-synken (provideren),
    // det redigerbare felt følger fraværet af puljeLockRound. Før var knappen
    // fejlagtigt gate't på puljeLockRound og forsvandt for SL — derfor kunne en
    // flyttet SL-kamp ikke hentes med vilje.
    mockGames.mockReturnValue({ games: [SL], loading: false });
    render(<GameScheduleTab />);
    expect(screen.getByRole('button', { name: /Synk kamptider nu/i })).toBeInTheDocument();
    // SL's deadline sættes stadig i hånden (intet puljeLockRound → redigerbart felt).
    expect(screen.getByText('🎖️ Bonus-/pulje-deadline')).toBeInTheDocument();
  });

  // Write-guarden kan IKKE bevises gennem komponenten: input-feltet rendres ikke
  // for et runde-spil, så `puljeLockAt`-state kan aldrig afvige fra spillet, og
  // en fjernelse af `!harPuljeRunde` i save() forblev grøn (TM-fund). Testet
  // direkte på den rene byggSchedulePatch, hvor state KAN afvige.
  describe('byggSchedulePatch — write-guarden på puljeLockAt', () => {
    it('skriver ALDRIG puljeLockAt for et runde-spil, selv når state afviger', () => {
      const patch = byggSchedulePatch({
        game: { id: 'pl', startAt: null, startRound: 3, puljeLockAt: null },
        startAt: '', startRound: '3',
        puljeLockAt: '2026-09-04T18:00', // afviger fra game.puljeLockAt (null)
        harPulje: true, harPuljeRunde: true,
      });
      expect(patch).not.toHaveProperty('puljeLockAt');
    });

    it('skriver puljeLockAt for et MANUELT pulje-spil, når den afviger', () => {
      const patch = byggSchedulePatch({
        game: { id: 'sl', startAt: null, startRound: null, puljeLockAt: null },
        startAt: '', startRound: '',
        puljeLockAt: '2026-09-04T18:00',
        harPulje: true, harPuljeRunde: false,
      });
      expect(patch.puljeLockAt).toBe(new Date('2026-09-04T18:00').getTime());
    });
  });
});

// ---------------------------------------------------------------------------
// ⚽ Synk kampdetaljer nu.
//
// Test Manager fandt knappen HELT utestet, mens dens to naboer havde både
// gate-tests og klik/besked-tests. Det er den slags asymmetri, der bliver til
// en tavs fejl: knappens fem beskeds-grene er dét, en administrator LÆSER og
// HANDLER PÅ, så en forkert besked er ikke kosmetik — den sender ejeren det
// forkerte sted hen.
// ---------------------------------------------------------------------------
describe('⚽ Synk kampdetaljer nu', () => {
  const SL = {
    id: 'superliga2627', name: 'Superligaen 2026/27', emoji: '⚽',
    type: 'football', status: 'open', sync: { provider: 'superliga' },
  };
  const PL = {
    id: 'pl2627-efteraar', name: 'Premier League 2026/27 — efterår', emoji: '⚽',
    type: 'football', status: 'open', sync: { provider: 'pulselive' },
  };
  const knap = () => screen.getByRole('button', { name: /Synk kampdetaljer nu/i });
  const klik = async (data) => {
    mockSyncDetaljer.mockResolvedValue({ ok: true, data });
    mockGames.mockReturnValue({ games: [SL], loading: false });
    render(<GameScheduleTab />);
    fireEvent.click(knap());
    await waitFor(() => expect(mockSyncDetaljer).toHaveBeenCalled());
  };

  it('nævner kampe i gang KUN når der er nogen — og siger, hvad der blev skrevet', async () => {
    await klik({ manglede: 0, live: { iGang: 2, skrevet: 1, uaendrede: 1, uenige: 0, ukendte: 0 } });
    await waitFor(() => expect(screen.getByText(/Alle færdige kampe har allerede/)).toBeInTheDocument());
    expect(screen.getByText(/Alle færdige kampe/)).toHaveTextContent('Live: 2 i gang, 1 lister skrevet, 1 uændrede.');
  });

  it('tier om live, når ingen kampe er i gang', async () => {
    await klik({ manglede: 0, live: { iGang: 0, skrevet: 0, uaendrede: 0 } });
    await waitFor(() => expect(screen.getByText(/Alle færdige kampe har allerede/)).toBeInTheDocument());
    expect(screen.getByText(/Alle færdige kampe/)).not.toHaveTextContent(/Live/);
  });

  it('siger, når live-delen fejlede', async () => {
    await klik({ manglede: 0, live: { fejl: 'kilden hænger' } });
    await waitFor(() => expect(screen.getByText(/Live-mål fejlede: kilden hænger/)).toBeInTheDocument());
  });

  it('vises for begge spil med livescore-kortlægning', () => {
    mockGames.mockReturnValue({ games: [SL, PL], loading: false });
    render(<GameScheduleTab />);
    expect(screen.getAllByRole('button', { name: /Synk kampdetaljer nu/i })).toHaveLength(2);
  });

  // DEN AFGØRENDE GATE-TEST. Samme facit-provider, andet spil-id: en gate på
  // sync.provider (harResultatSynk) ville vise knappen her, og hvert klik
  // kunne kun fejle med invalid-argument. Det er puljeLockRound-fejlen.
  it('vises IKKE for et spil med SAMME provider, men uden kortlægning', () => {
    mockGames.mockReturnValue({
      games: [{ ...SL, id: 'sl2728', name: 'Superligaen 27/28' }],
      loading: false,
    });
    render(<GameScheduleTab />);
    expect(screen.queryByRole('button', { name: /Synk kampdetaljer nu/i })).not.toBeInTheDocument();
  });

  it('vises IKKE for et spil uden synk (Touren)', () => {
    mockGames.mockReturnValue({ games: [TOUR], loading: false });
    render(<GameScheduleTab />);
    expect(screen.queryByRole('button', { name: /Synk kampdetaljer nu/i })).not.toBeInTheDocument();
  });

  // INGEN confirm — bevidst, og derfor bundet. Kaldet kan hverken afregne
  // point, flytte Elo eller få Runde-Botten til at poste, og en confirm foran
  // en harmløs handling lærer folk at klikke OK uden at læse.
  it('kalder serveren UDEN at spørge om lov', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await klik({ manglede: 0 });
    expect(bekraeft).not.toHaveBeenCalled();
    expect(mockSyncDetaljer).toHaveBeenCalledWith('superliga2627');
    bekraeft.mockRestore();
  });

  it('siger klart fra, når alt allerede er hentet', async () => {
    await klik({ manglede: 0, skrevet: 0 });
    expect(await screen.findByText(/Alle færdige kampe har allerede halvleg og målscorere/))
      .toBeInTheDocument();
  });

  // De to afvisningstal SKAL nævnes hver for sig: "uenige om facit" kræver et
  // menneske, der ser på kampen, mens "kunne ikke læses" betyder, at VORES
  // parsning er mangelfuld. Ét fælles tal kunne ikke sige hvilken.
  it('nævner uenige og ulæselige HVER FOR SIG — de har hver sin remedie', async () => {
    await klik({ manglede: 10, skrevet: 6, uenige: 3, uparsede: 1, ukendte: 0 });
    const besked = await screen.findByText(/6 kampe fik detaljer/);
    expect(besked).toHaveTextContent('4 mangler endnu');
    expect(besked).toHaveTextContent('3 hvor kildens facit er et andet end vores');
    expect(besked).toHaveTextContent('1 kunne ikke læses');
    expect(besked).toHaveTextContent(/prøves igen om en uge/i);
  });

  // ── Beskeden løj i produktion ───────────────────────────────────────────
  it('lover IKKE et genforsøg om en uge for en UKOBLET kamp', async () => {
    // Sådan så den ægte besked ud ved første tryk: 33 hentet, 1 ukoblet — og
    // halen sagde "Afviste kampe prøves igen om en uge". Det er forkert:
    // karantænen sættes kun ved uenig/ulæselig. En ukoblet kamp prøves igen
    // ved HVER kørsel og fejler hver gang, til kortlægningen rettes. Beskeden
    // fik ejeren til at vente på noget, der aldrig sker af sig selv.
    await klik({ manglede: 34, skrevet: 33, uenige: 0, uparsede: 0, ukendte: 1 });
    const besked = await screen.findByText(/33 kampe fik detaljer/);
    expect(besked).toHaveTextContent('1 kunne ikke kobles til kilden');
    expect(besked).toHaveTextContent(/retter sig IKKE selv/);
    // Og dét, der IKKE må stå — en grøn suite beviser ikke, at teksten er væk.
    expect(besked).not.toHaveTextContent(/om en uge/i);
  });

  it('siger om en kilde-nedetid at den prøves igen — ikke at noget er i stykker', async () => {
    await klik({ manglede: 5, skrevet: 2, utilgaengelige: 3 });
    const besked = await screen.findByText(/2 kampe fik detaljer/);
    expect(besked).toHaveTextContent('3 hvor kilden ikke svarede');
    expect(besked).toHaveTextContent(/prøves igen ved næste kørsel/);
    expect(besked).not.toHaveTextContent(/om en uge/i);
  });

  // TEST MANAGERS FUND: badge-FARVEN var helt utestet. Man kunne hardkode
  // kind:'ok' uanset input, eller fjerne `d.ukendte` fra betingelsen, og alle
  // 70 tests forblev grønne. Farven er dét, en administrator ser FØRST — og
  // det var netop en manglende `ukendte` i den anden fladens farvevalg, der
  // gjorde Drift-kortet grønt på en ukoblet kamp.
  const farve = () => screen.getByText(/kampe fik detaljer|allerede halvleg/)
    .closest('[class*="badge"], .msg, p, div').className;

  it('farver beskeden RØD, når noget kræver en hånd', async () => {
    // ukendte og uparsede kræver et menneske: koblingen retter sig aldrig
    // selv, og en ulæselig kamp betyder, at VORES parsning er mangelfuld.
    for (const d of [
      { manglede: 34, skrevet: 33, ukendte: 1 },
      { manglede: 10, skrevet: 9, uparsede: 1 },
    ]) {
      cleanup();
      await klik(d);
      expect(farve(), JSON.stringify(d)).toMatch(/err|red|fejl/i);
    }
  });

  it('farver den IKKE rød, når intet kræver en hånd', async () => {
    // uenige og kilde-nedetid retter sig selv eller er legitime. Et rødt kort,
    // der ikke kan lukkes, lærer administratoren at ignorere fladen.
    for (const d of [
      { manglede: 10, skrevet: 8, uenige: 2 },
      { manglede: 5, skrevet: 2, utilgaengelige: 3 },
      { manglede: 8, skrevet: 8 },
    ]) {
      cleanup();
      await klik(d);
      expect(farve(), JSON.stringify(d)).not.toMatch(/err|red|fejl/i);
    }
  });

  it('siger at kilden lukkede os ude — ikke at noget er i stykker', async () => {
    await klik({ manglede: 5, skrevet: 0, afbrudt: true });
    const besked = await screen.findByText(/Kilden afviste os/);
    // Og den skal sige HVORFOR vi stopper: det er naboerne, vi beskytter.
    expect(besked).toHaveTextContent(/for ikke at ramme de andre synk/);
    expect(besked).toHaveTextContent(/Prøv igen om en time/);
  });

  it('viser serverens fejl frem for en tom besked', async () => {
    mockSyncDetaljer.mockResolvedValue({ ok: false, error: 'permission-denied' });
    mockGames.mockReturnValue({ games: [SL], loading: false });
    render(<GameScheduleTab />);
    fireEvent.click(knap());
    expect(await screen.findByText('permission-denied')).toBeInTheDocument();
  });
});

// ✍️ Sæt eller ret facit i hånden — nødbremsen. Selve dialogen er testet i
// ManuelFacit.test.jsx; her bevises KUN render-betingelsen pr. spil: den
// gælder ALLE kampspil (også uden synk), og den sidder ved synk-knappen.
describe('✍️ Sæt eller ret facit i hånden — hvilke spil har knappen', () => {
  const knapper = () => screen.queryAllByRole('button', { name: /Sæt eller ret facit i hånden/ });
  const SL_SYNK = { id: 'superliga2627', name: 'Superligaen 2026/27', type: 'football', status: 'live', sync: { provider: 'superliga' } };
  const PL_SYNK = { ...PL, sync: { provider: 'pulselive' } };
  // Håndboldspillet, før provideren er i drift: INGEN synk — og derfor
  // ingen "Synk resultater nu". Det er netop det spil, nødbremsen er til.
  const HB = { id: 'hvm2027', name: 'Håndbold-VM 2027', type: 'football', status: 'open', sport: 'haandbold' };

  it('Superligaen og Premier League har den — ved siden af synk-knappen', () => {
    mockGames.mockReturnValue({ games: [SL_SYNK, PL_SYNK], loading: false });
    render(<GameScheduleTab />);
    expect(knapper()).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Synk resultater nu/ })).toHaveLength(2);
  });

  it('et kampspil UDEN synk har den — men ikke synk-knappen', () => {
    mockGames.mockReturnValue({ games: [HB], loading: false });
    render(<GameScheduleTab />);
    expect(knapper()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Synk resultater nu/ })).not.toBeInTheDocument();
  });

  it('også et afsluttet kampspil — en rettelse kan komme efter sidste kamp', () => {
    mockGames.mockReturnValue({ games: [{ ...HB, status: 'finished' }], loading: false });
    render(<GameScheduleTab />);
    expect(knapper()).toHaveLength(1);
  });

  it('Touren (ikke et kampspil) har den ikke', () => {
    mockGames.mockReturnValue({ games: [TOUR], loading: false });
    render(<GameScheduleTab />);
    expect(knapper()).toHaveLength(0);
  });

  // harSynk afgøres i Spil-tidsplanen (harResultatSynk) og gives videre.
  // ManuelFacit.test.jsx sætter harSynk direkte og kan ikke se, hvis
  // ledningen her bliver hardkodet — denne render-test kan. Positiv kontrol
  // med samme kamp i Superligaen, så fraværet ikke bare er et tomt panel.
  const MANUEL_KAMP = { id: 'r1-dk-no', round: 1, home: 'Danmark', away: 'Norge', kickoff: Date.now() - 4 * 3600e3, result: '1', homeGoals: 30, awayGoals: 28, resultatKilde: 'manuel' };
  async function vaelgManuelKamp(game) {
    mockGetDocs.mockResolvedValue({ docs: [{ id: MANUEL_KAMP.id, data: () => MANUEL_KAMP }] });
    mockGames.mockReturnValue({ games: [game], loading: false });
    render(<GameScheduleTab />);
    fireEvent.click(screen.getByRole('button', { name: /Sæt eller ret facit i hånden/ }));
    const select = await screen.findByLabelText(`Kamp at sætte facit på i ${game.name}`);
    fireEvent.change(select, { target: { value: MANUEL_KAMP.id } });
    await screen.findByLabelText('Mål Danmark');
  }

  it('spil UDEN synk: en kamp sat i hånden har ingen "Lad synken overtage igen"', async () => {
    await vaelgManuelKamp(HB);
    expect(screen.queryByRole('button', { name: /Lad synken overtage igen/ })).not.toBeInTheDocument();
  });

  it('spil MED synk: samme kamp har "Lad synken overtage igen"', async () => {
    await vaelgManuelKamp(SL_SYNK);
    expect(screen.getByRole('button', { name: /Lad synken overtage igen/ })).toBeInTheDocument();
  });

  it('henter ingen kampe, før knappen trykkes', () => {
    mockGames.mockReturnValue({ games: [SL_SYNK, PL_SYNK, HB], loading: false });
    render(<GameScheduleTab />);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });
});

// 📥 Læg næste fases kampe ind (D9). Selve formularen er testet i
// FaseKampe.test.jsx; her bevises render-betingelsen pr. spil: evnen
// forventerFaseKampe (åbent/igangværende kampspil MED gyldig fasekalender) —
// og at knappen sidder lige efter ✍️, hvor alarmen sender ejeren hen.
describe('📥 Læg næste fases kampe ind — hvilke spil har knappen', () => {
  const knapper = () => screen.queryAllByRole('button', { name: /Læg næste fases kampe ind/ });
  const SL_SYNK = { id: 'superliga2627', name: 'Superligaen 2026/27', type: 'football', status: 'live', sync: { provider: 'superliga' } };
  const PL_SYNK = { ...PL, sync: { provider: 'pulselive' } };
  const HB = { ...HAANDBOLD_SPIL, status: 'open' };

  it('håndboldspillet med kalender har den — lige efter ✍️', () => {
    mockGames.mockReturnValue({ games: [HB], loading: false });
    render(<GameScheduleTab />);
    expect(knapper()).toHaveLength(1);
    const alle = screen.getAllByRole('button').map((b) => b.textContent);
    const facit = alle.findIndex((t) => /Sæt eller ret facit i hånden/.test(t));
    expect(alle[facit + 1]).toBe('📥 Læg næste fases kampe ind');
    // Ordlyden lover ikke mere end handlingen: knappen henter intet.
    expect(screen.queryByRole('button', { name: /Hent .*kampe/ })).toBeNull();
  });

  // FRAVÆR (ny): ligaerne har ingen kalender — og et afsluttet spil
  // forventer ingen kampe. En proxy-gate (sporten, !sync) ville ramme forkert.
  it('Superligaen, Premier League, et afsluttet håndboldspil og Touren har den IKKE', () => {
    mockGames.mockReturnValue({ games: [SL_SYNK, PL_SYNK, { ...HB, id: 'hb-slut', status: 'finished' }, TOUR], loading: false });
    render(<GameScheduleTab />);
    expect(knapper()).toHaveLength(0);
    // Positiv kontrol: ✍️ står stadig for de tre kampspil.
    expect(screen.getAllByRole('button', { name: /Sæt eller ret facit i hånden/ })).toHaveLength(3);
  });

  it('et håndboldspil UDEN gyldig kalender har den ikke (sporten er ikke evnen)', () => {
    mockGames.mockReturnValue({ games: [{ ...HB, faser: [{ ...HB.faser[0], fra: 2 }] }], loading: false });
    render(<GameScheduleTab />);
    expect(knapper()).toHaveLength(0);
  });
});

// --- Runde-puljen (semifinalisterne) og deadlinen uden kickoff-synk ----------
describe('pulje i en turnering', () => {
  const FASER = [
    { navn: 'Kvartfinaler', bestemt: 'Kvartfinalerne', fra: 1, til: 2, start: '2027-01-27', knockout: true, antalKampe: 4 },
    { navn: 'Semifinaler', bestemt: 'Semifinalerne', fra: 3, til: 3, start: '2027-01-29', knockout: true, antalKampe: 2 },
  ];
  // Intet sync-felt: provideren er ikke i drift endnu (D8). Det er netop det
  // spil, fælden rammer.
  const HVM = {
    id: 'hvm', name: 'Håndbold-VM', emoji: '🤾', type: 'football', status: 'open', faser: FASER,
    pulje: { poolSize: 4, facitKilde: 'runde', facitFase: 'Semifinaler' }, puljeLockRound: 1,
  };

  it('en runde-pulje, der aldrig kan afgøres, siges højt ved spillet', () => {
    mockGames.mockReturnValue({ games: [{ ...HVM, pulje: { ...HVM.pulje, facitFase: 'Ottendedele' } }], loading: false });
    render(<GameScheduleTab />);
    expect(screen.getByTestId('pulje-ugyldig').textContent).toBe('⚠️ Puljen kan ikke afgøres: fasen «Ottendedele» findes ikke i kalenderen. '
      + 'Pulje-tippene bliver aldrig afregnet, før det er rettet. Ret pulje (og faser) i scripts/games.mjs og kør Deploy platform med seedGames — først som tør-kørsel, så med seedGamesSkriv.');
  });

  it('ingen pulje-linje for en gyldig runde-pulje, for Superligaen eller for et spil uden pulje', () => {
    mockGames.mockReturnValue({
      games: [HVM, { id: 'sl', name: 'SL', type: 'football', pulje: { poolSize: 6 } }, { id: 'x', name: 'X', type: 'football' }],
      loading: false,
    });
    render(<GameScheduleTab />);
    expect(screen.queryByTestId('pulje-ugyldig')).toBeNull();
    expect(document.body.textContent).not.toContain('Puljen kan ikke afgøres');
  });

  // FÆLDEN: puljeLockRound uden kickoff-synk. Før var feltet låst ("udledt af
  // runde 1"), og knappen, teksten henviste til, fandtes ikke for spillet —
  // så deadlinen kunne hverken udledes eller sættes, og puljen stod "Endnu
  // ikke åbnet" for evigt.
  it('puljeLockRound UDEN kickoff-synk: deadlinen kan sættes i hånden, og det siges hvorfor', async () => {
    mockGames.mockReturnValue({ games: [HVM], loading: false });
    render(<GameScheduleTab />);
    expect(screen.getByText('🎖️ Bonus-/pulje-deadline')).toBeInTheDocument();
    expect(screen.queryByText(/udledt af runde/i)).toBeNull();
    expect(screen.queryByText(/kør 🗓️ Synk kamptider nu/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Synk kamptider nu/i })).toBeNull();
    // Turneringens ord («dagens»), og intet feltnavn, admin ikke kan se nogen steder.
    expect(screen.getByTestId('pulje-runde-uden-synk').textContent).toBe(
      'Pulje-deadlinen hører til Kvartfinaler · dag 1, men spillet har ingen kickoff-synk, så intet udleder den. '
      + 'Sæt den her — til dagens første kickoff. Får spillet senere en kickoff-synk, flytter den deadlinen til '
      + 'dagens tidligste kickoff, så længe den ikke er passeret.',
    );
    expect(screen.getByTestId('pulje-runde-uden-synk').textContent).not.toMatch(/puljeLockRound|rundens/);
  });

  it('… og et Gem skriver den håndsatte deadline', async () => {
    mockGames.mockReturnValue({ games: [HVM], loading: false });
    render(<GameScheduleTab />);
    fireEvent.change(screen.getByLabelText(/Bonus-\/pulje-deadline/), { target: { value: '2027-01-13T17:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    await waitFor(() => expect(mockSetGameSchedule).toHaveBeenCalled());
    const [, patch] = mockSetGameSchedule.mock.calls.at(-1);
    expect(patch).toHaveProperty('puljeLockAt', new Date('2027-01-13T17:00').getTime());
  });

  // Knappen stod urørt i fladevagtens basislinje. Den nye pulje-knap foran
  // den flyttede dens plads i rækkefølgen, så den blev rørt i stedet for at
  // blive skubbet videre i basislinjen.
  it('🔐 Genopbyg liga-adgang: kalder backfill for spillet og siger, hvad der blev rettet', async () => {
    mockGames.mockReturnValue({ games: [HVM], loading: false });
    mockBackfill.mockResolvedValueOnce({ ok: true, data: { players: 12, changed: 2, bets: 40, betsChanged: 3 } });
    render(<GameScheduleTab />);
    fireEvent.click(screen.getByRole('button', { name: '🔐 Genopbyg liga-adgang til stilling og tips' }));
    expect(await screen.findByText('Gennemgik 12 spillere (rettede 2) og 40 tips (rettede 3).')).toBeInTheDocument();
    expect(mockBackfill).toHaveBeenCalledWith('hvm');
    mockBackfill.mockResolvedValueOnce({ ok: false, error: 'Kun admin.' });
    fireEvent.click(screen.getByRole('button', { name: '🔐 Genopbyg liga-adgang til stilling og tips' }));
    expect(await screen.findByText('Kun admin.')).toBeInTheDocument();
  });

  // --- 🎖️ Afregn puljen med vilje (modstander-fund R4a) ----------------------
  // Triggeren afregner kun ved en facit-ÆNDRING. En runde-pulje afgøres af,
  // at en fase lægges ind — rettes fasen efter finalen, ville intet starte
  // afregningen. Knappen findes KUN for en runde-pulje.
  const afregnKnap = () => screen.getByRole('button', { name: '🎖️ Afregn puljen — vis hvad der sker' });

  it('knappen findes for en runde-pulje — og IKKE for Superligaen, Premier League eller et spil uden pulje', () => {
    mockGames.mockReturnValue({
      games: [
        { id: 'sl', name: 'SL', type: 'football', pulje: { poolSize: 6 } },
        { id: 'pl', name: 'PL', type: 'football', pulje: { poolSize: 4, nedSize: 3, facitKilde: 'egneKampe' } },
        { id: 'x', name: 'X', type: 'football' },
      ],
      loading: false,
    });
    const { unmount } = render(<GameScheduleTab />);
    expect(screen.queryByRole('button', { name: /Afregn puljen/ })).toBeNull();
    unmount();
    mockGames.mockReturnValue({ games: [HVM], loading: false });
    render(<GameScheduleTab />);
    expect(afregnKnap()).toBeInTheDocument();
  });

  it('tør → skriv: tør-kørslen viser facit, tip og point; først DEREFTER kan der afregnes', async () => {
    mockGames.mockReturnValue({ games: [HVM], loading: false });
    mockAfregn.mockResolvedValueOnce({
      ok: true,
      data: { settled: 0, dryRun: true, kanAfregnes: true, aarsag: null, fejl: [], facit: ['DK', 'FR', 'SE', 'HR'], tip: 2, point: 30 },
    });
    render(<GameScheduleTab />);
    expect(screen.queryByRole('button', { name: /Afregn de/ })).toBeNull();
    fireEvent.click(afregnKnap());
    await waitFor(() => expect(screen.getByTestId('pulje-afregn-besked')).toBeInTheDocument());
    expect(mockAfregn).toHaveBeenLastCalledWith({ gameId: 'hvm', dryRun: true });
    expect(screen.getByTestId('pulje-afregn-besked').textContent)
      .toBe('Tør-kørsel: 2 pulje-tip ville blive afregnet mod DK, FR, SE, HR — 30 point i alt.');
    mockAfregn.mockResolvedValueOnce({ ok: true, data: { settled: 2, dryRun: false } });
    fireEvent.click(screen.getByRole('button', { name: 'Afregn de 2 pulje-tip' }));
    await waitFor(() => expect(screen.getByTestId('pulje-afregn-besked').textContent)
      .toBe('2 pulje-tip er afregnet, og stillingen er genberegnet.'));
    expect(mockAfregn).toHaveBeenLastCalledWith({ gameId: 'hvm', dryRun: false });
    // Skrive-knappen er væk: ingen anden afregning på et forældet grundlag.
    expect(screen.queryByRole('button', { name: /Afregn de/ })).toBeNull();
  });

  it('kan puljen ikke afgøres, siges hvorfor — rødt ved en fejl — og der er intet at afregne', async () => {
    mockGames.mockReturnValue({ games: [HVM], loading: false });
    mockAfregn.mockResolvedValueOnce({
      ok: true,
      data: { settled: 0, dryRun: true, kanAfregnes: false, aarsag: 'DK står i to kampe i «Semifinaler»', fejl: ['DK står i to kampe i «Semifinaler»'], facit: null, tip: 0, point: 0 },
    });
    render(<GameScheduleTab />);
    fireEvent.click(afregnKnap());
    const besked = await screen.findByTestId('pulje-afregn-besked');
    expect(besked.textContent).toBe('Puljen kan IKKE afgøres: DK står i to kampe i «Semifinaler».');
    expect(besked.className).toContain('badge--red');
    expect(screen.queryByRole('button', { name: /Afregn de/ })).toBeNull();
  });

  it('… og grønt, når fasen bare ikke er lagt ind endnu', async () => {
    mockGames.mockReturnValue({ games: [HVM], loading: false });
    mockAfregn.mockResolvedValueOnce({
      ok: true,
      data: { settled: 0, dryRun: true, kanAfregnes: false, aarsag: 'semifinalerne er ikke lagt ind endnu', fejl: [], facit: null, tip: 0, point: 0 },
    });
    render(<GameScheduleTab />);
    fireEvent.click(afregnKnap());
    const besked = await screen.findByTestId('pulje-afregn-besked');
    expect(besked.textContent).toBe('Puljen kan ikke afgøres endnu: semifinalerne er ikke lagt ind endnu.');
    expect(besked.className).toContain('badge--green');
    expect(screen.queryByRole('button', { name: /Afregn de/ })).toBeNull();
  });

  it('ingen tip: intet at afregne — og ingen skrive-knap', async () => {
    mockGames.mockReturnValue({ games: [HVM], loading: false });
    mockAfregn.mockResolvedValueOnce({
      ok: true,
      data: { settled: 0, dryRun: true, kanAfregnes: true, aarsag: 'ingen har afgivet et pulje-tip', fejl: [], facit: null, tip: 0, point: 0 },
    });
    render(<GameScheduleTab />);
    fireEvent.click(afregnKnap());
    expect((await screen.findByTestId('pulje-afregn-besked')).textContent)
      .toBe('Puljen kan afgøres, men ingen har afgivet et pulje-tip.');
    expect(screen.queryByRole('button', { name: /Afregn de/ })).toBeNull();
  });

  it('svarer serveren med en tør kørsel på et skriv, siges det — ikke "afregnet"', async () => {
    mockGames.mockReturnValue({ games: [HVM], loading: false });
    mockAfregn.mockResolvedValueOnce({
      ok: true, data: { settled: 0, dryRun: true, kanAfregnes: true, aarsag: null, fejl: [], facit: ['DK', 'FR', 'SE', 'HR'], tip: 1, point: 4 },
    });
    render(<GameScheduleTab />);
    fireEvent.click(afregnKnap());
    await screen.findByRole('button', { name: 'Afregn de 1 pulje-tip' });
    mockAfregn.mockResolvedValueOnce({ ok: true, data: { settled: 0, dryRun: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Afregn de 1 pulje-tip' }));
    await waitFor(() => expect(screen.getByTestId('pulje-afregn-besked').textContent)
      .toBe('Serveren tørkørte og skrev INTET. Prøv igen.'));
    // Et kald-fejl vises rødt.
    mockAfregn.mockResolvedValueOnce({ ok: false, error: 'Kun admin.' });
    fireEvent.click(afregnKnap());
    await waitFor(() => expect(screen.getByTestId('pulje-afregn-besked').textContent).toBe('Kun admin.'));
  });

  // QC-fund: «0 pulje-tip er afregnet, og stillingen er genberegnet» stod,
  // når facit eller tip havde ændret sig mellem tør-kørslen og skrivningen —
  // serveren afregnede intet, og beskeden lod som om.
  it('et skriv, der intet afregnede, siger det — og beder om en ny tør-kørsel', async () => {
    mockGames.mockReturnValue({ games: [HVM], loading: false });
    mockAfregn.mockResolvedValueOnce({
      ok: true, data: { settled: 0, dryRun: true, kanAfregnes: true, aarsag: null, fejl: [], facit: ['DK', 'FR', 'SE', 'HR'], tip: 2, point: 30 },
    });
    render(<GameScheduleTab />);
    fireEvent.click(afregnKnap());
    await screen.findByRole('button', { name: 'Afregn de 2 pulje-tip' });
    mockAfregn.mockResolvedValueOnce({ ok: true, data: { settled: 0, dryRun: false } });
    fireEvent.click(screen.getByRole('button', { name: 'Afregn de 2 pulje-tip' }));
    await waitFor(() => expect(screen.getByTestId('pulje-afregn-besked').textContent)
      .toBe('Intet blev afregnet: puljen har ændret sig siden tør-kørslen. Kør 🎖️ Afregn puljen igen for at se, hvordan den står nu.'));
    const besked = screen.getByTestId('pulje-afregn-besked');
    expect(besked.className).toContain('badge--red');
    expect(besked.textContent).not.toMatch(/er afregnet|genberegnet/);
    expect(screen.queryByRole('button', { name: /Afregn de/ })).toBeNull();
  });

  it('MED kickoff-synk er deadlinen stadig udledt og låst (Premier League-formen)', () => {
    mockGames.mockReturnValue({ games: [{ ...HVM, sync: { provider: 'pulselive' } }], loading: false });
    render(<GameScheduleTab />);
    // Med fasekalender hedder runden «dag» — ikke «runde» (modstander-bemærkning).
    expect(screen.getByText(/udledt af dag 1\)/)).toBeInTheDocument();
    expect(screen.queryByText(/udledt af runde/i)).toBeNull();
    expect(screen.queryByText('🎖️ Bonus-/pulje-deadline')).toBeNull();
    expect(screen.queryByTestId('pulje-runde-uden-synk')).toBeNull();
    // Turneringens ord i forklaringen — ikke ligaens «rundens».
    expect(screen.getByText(/Sættes IKKE i hånden/).textContent).toBe(
      'Sættes IKKE i hånden: udledes automatisk til dagens tidligste kickoff ved kickoff-synken og følger med, hvis kampen flyttes.',
    );
  });
});

// ---------------------------------------------------------------------------
// LIGAENS ORD I EN TURNERING (QC-klient bør 2 og 4). Teksterne her stod med
// «sæsonen», «rundens» og «en runde» for alle spil. En turnering (spil med
// fasekalender — rundeOrdene) har en turnering og dage. Superligaen skal stå
// PRÆCIS som før; turneringen må ikke sige «sæson» noget sted på kortet.
// ---------------------------------------------------------------------------
describe('turneringens ord — Superligaen uændret, håndbold uden «sæson»', () => {
  const SL = { id: 'superliga2627', name: 'Superligaen 2026/27', emoji: '⚽', type: 'football', status: 'open' };
  const HB = { ...HAANDBOLD_SPIL, status: 'open' };
  const hjaelp = () => screen.getByText(/^Åbent for tilmelding/).textContent;

  it('status-hjælpen: «i sæsonen» i ligaen, «i turneringen» i turneringen', () => {
    mockGames.mockReturnValue({ games: [SL], loading: false });
    const { unmount } = render(<GameScheduleTab />);
    expect(hjaelp()).toBe('Åbent for tilmelding. Vises under "Åbne spil — deltag", hvis spillet er sat til Synligt nedenfor. '
      + 'Spillerne kan forlade spillet igen — også med point: de forsvinder fra stillingen og deres ligaer, tips på kommende '
      + 'kampe slettes, men point og historik arkiveres, og kommer de tilbage i sæsonen, får de stillingen igen.');
    unmount();
    mockGames.mockReturnValue({ games: [HB], loading: false });
    render(<GameScheduleTab />);
    expect(hjaelp()).toContain('og kommer de tilbage i turneringen, får de stillingen igen.');
    expect(hjaelp()).not.toMatch(/sæson/i);
  });

  it('⬇️ Synk resultater nu: confirm og kvittering med turneringens ord — ligaen uændret', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockSyncResults.mockResolvedValue({
      ok: true, data: { checked: 4, updated: 1, rettede: ['r16-1'], standings: { rows: 0, changed: false } },
    });
    try {
      mockGames.mockReturnValue({ games: [{ ...SL, sync: { provider: 'superliga' } }], loading: false });
      const { unmount } = render(<GameScheduleTab />);
      fireEvent.click(screen.getByRole('button', { name: /Synk resultater nu/i }));
      await waitFor(() => expect(screen.getByText(/1 kamp fik nyt facit/)).toBeInTheDocument());
      const liga = bekraeft.mock.calls[0][0];
      expect(liga).toContain('Hele sæsonen tjekkes — det er præcis, hvad den automatiske synk selv gør hver time');
      expect(liga).toContain('Fuldender et facit en runde, poster Runde-Botten sit opslag på liga-væggene NU (højst én gang pr. runde)');
      expect(screen.getByText(/1 kamp fik nyt facit/).textContent).toContain('Fuldendte et facit en runde, poster Runde-Botten');
      unmount();

      mockGames.mockReturnValue({ games: [{ ...HB, sync: { provider: 'superliga' } }], loading: false });
      render(<GameScheduleTab />);
      fireEvent.click(screen.getByRole('button', { name: /Synk resultater nu/i }));
      await waitFor(() => expect(screen.getByText(/1 kamp fik nyt facit/)).toBeInTheDocument());
      const turnering = bekraeft.mock.calls[1][0];
      expect(turnering).toContain('Hele turneringen tjekkes');
      expect(turnering).toContain('Fuldender et facit en dag, poster Runde-Botten sit opslag på liga-væggene NU (højst én gang pr. dag)');
      expect(turnering).not.toMatch(/sæson|en runde|pr\. runde/i);
      const kvittering = screen.getByText(/1 kamp fik nyt facit/).textContent;
      expect(kvittering).toContain('Fuldendte et facit en dag');
      expect(kvittering).not.toMatch(/en runde/);
    } finally { bekraeft.mockRestore(); }
  });

  it('pulje-deadlinen uden kickoff-synk: ligaens «rundens» — og aldrig feltnavnet', () => {
    mockGames.mockReturnValue({ games: [{ ...SL, pulje: { poolSize: 6 }, puljeLockRound: 1 }], loading: false });
    render(<GameScheduleTab />);
    expect(screen.getByTestId('pulje-runde-uden-synk').textContent).toBe(
      'Pulje-deadlinen hører til Runde 1, men spillet har ingen kickoff-synk, så intet udleder den. '
      + 'Sæt den her — til rundens første kickoff. Får spillet senere en kickoff-synk, flytter den deadlinen til '
      + 'rundens tidligste kickoff, så længe den ikke er passeret.',
    );
  });

  // FRAVÆRS-ASSERTION over HELE kortet: en turnering med runde-pulje og
  // pulje-deadline uden synk — de flader, der før sagde «sæson».
  it('intet sted på turneringens kort står «sæson»', () => {
    mockGames.mockReturnValue({
      games: [{ ...HB, pulje: { poolSize: 4, facitKilde: 'runde', facitFase: 'Semifinaler', maksStartRunde: 1 }, puljeLockRound: 1 }],
      loading: false,
    });
    render(<GameScheduleTab />);
    expect(screen.getByTestId('pulje-runde-uden-synk').textContent).toContain('til dagens første kickoff');
    expect(hjaelp()).toContain('i turneringen');
    expect(document.body.textContent).not.toMatch(/sæson/i);
  });
});

// ---------------------------------------------------------------------------
// HÅNDBOLD-VM 2027 SOM DET SEEDES (D6). Ikke en fixture, der ligner: posten
// fra scripts/games.mjs gennem seedPayload, præcis som seedGames skriver den
// på et nyt dokument. Klik-stien til at afsløre og gennemgå spillet skal være
// sporet på DETTE spil — ikke på nabospillet PL (CLAUDE.md: klik-stier).
// ---------------------------------------------------------------------------
describe('Håndbold-VM 2027, som seedGames opretter det', async () => {
  const { GAMES } = await import('../../../scripts/games.mjs');
  const { seedPayload } = await import('../../../scripts/seed-payload.mjs');
  const { id, ...data } = GAMES.find((g) => g.id === 'hvm2027');
  const dok = seedPayload(data, { exists: false, now: null });
  delete dok.createdAt;
  delete dok.updatedAt;
  const HVM2027 = { id, ...dok };

  beforeEach(() => {
    mockGames.mockReturnValue({ games: [HVM2027], loading: false });
  });

  it('står i Spil-tidsplan som SKJULT, med knappen, der afslører det', () => {
    render(<GameScheduleTab />);
    expect(screen.getByLabelText('Status for Håndbold-VM 2027').value).toBe('open');
    expect(screen.getByText('Skjult')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Vis spillet/ })).toBeInTheDocument();
    expect(screen.queryByText('Synligt for spillerne')).toBeNull();
    // Vejen til selv at gennemgå kampene, med spillets egen adresse.
    expect(screen.getByText(/åbn \/spil\/hvm2027 og tilmeld dig/)).toBeInTheDocument();
  });

  it('har facit i hånden, men ingen synk-knapper — spillet har ingen kilde endnu (D8)', () => {
    render(<GameScheduleTab />);
    expect(screen.getByRole('button', { name: /Sæt eller ret facit i hånden/ })).toBeInTheDocument();
    // D9: og knappen, der lægger næste fases kampe ind — for PRÆCIS dette
    // spil, som seedGames skriver det (CLAUDE.md: en flade er først færdig,
    // når den vises for det konkrete spil).
    expect(screen.getByRole('button', { name: '📥 Læg næste fases kampe ind' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Synk resultater nu/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Synk kamptider nu/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Synk kampdetaljer nu/ })).toBeNull();
  });

  // Uden kickoff-synk udleder intet deadlinen — feltet skal kunne udfyldes,
  // og teksten skal nævne kalenderens dag, ikke «Runde 1».
  it('pulje-deadlinen sættes i hånden indtil kickoff-synken — med dagens navn', () => {
    render(<GameScheduleTab />);
    expect(screen.getByLabelText(/Bonus-\/pulje-deadline/)).toBeInTheDocument();
    const tekst = screen.getByTestId('pulje-runde-uden-synk').textContent;
    expect(tekst).toMatch(/^Pulje-deadlinen hører til Indledende runde · dag 1, men spillet har ingen kickoff-synk/);
    expect(tekst).not.toMatch(/Runde 1|puljeLockRound/);
    // Kalenderen og puljen er gyldige: ingen af de røde advarsler.
    expect(screen.queryByText(/Puljen kan ikke afgøres/)).toBeNull();
    expect(screen.queryByText(/Fasekalenderen er ugyldig/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DEADLINE FØR SYNLIGHED (D6, alle fire roller). Uden puljeLockAt er pulje-
// tippet lukket for evigt, og invitationen nævner ingen deadline. Rækkefølgen
// «sæt deadline → Vis spillet → invitationer» stod kun i runbooken; her er
// vagten ved knappen. Gaten er «deadlinen sættes i hånden og er ikke gemt» —
// ikke håndbold: PL (udledt af synken) og spil uden pulje får den ikke.
// ---------------------------------------------------------------------------
describe('advarslen om manglende bonus-deadline ved Vis spillet', async () => {
  const { GAMES } = await import('../../../scripts/games.mjs');
  const { seedPayload } = await import('../../../scripts/seed-payload.mjs');
  const { id, ...data } = GAMES.find((g) => g.id === 'hvm2027');
  const dok = seedPayload(data, { exists: false, now: null });
  delete dok.createdAt;
  delete dok.updatedAt;
  const HVM2027 = { id, ...dok };
  const SKJULT_TEKST = '⚠️ Bonus-deadlinen er ikke sat. Uden den er pulje-tippet lukket («Endnu ikke åbnet»), '
    + 'og en invitation nævner ingen deadline. Sæt deadlinen i feltet ovenfor og tryk Gem — FØR du viser spillet og sender invitationer.';
  const SYNLIG_TEKST = '⚠️ Bonus-deadlinen er ikke sat. Spillet er synligt, men pulje-tippet er lukket («Endnu ikke åbnet»), '
    + 'og en invitation nævner ingen deadline. Sæt deadlinen i feltet ovenfor og tryk Gem, før du sender invitationer.';
  const vis = (game) => {
    mockGames.mockReturnValue({ games: [game], loading: false });
    return render(<GameScheduleTab />);
  };

  it('det seedede hvm2027 (skjult, ingen deadline) får advarslen — med ordlyden og rollen', () => {
    vis(HVM2027);
    const linje = screen.getByTestId('mangler-pulje-deadline');
    expect(linje.textContent).toBe(SKJULT_TEKST);
    expect(linje.getAttribute('role')).toBe('alert');
    // Knappen står der stadig: det er en advarsel, ikke en spærring.
    expect(screen.getByRole('button', { name: /Vis spillet/ })).toBeInTheDocument();
  });

  it('når spillet allerede er synligt, siger den IKKE «før du viser spillet»', () => {
    vis({ ...HVM2027, joinable: true });
    const tekst = screen.getByTestId('mangler-pulje-deadline').textContent;
    expect(tekst).toBe(SYNLIG_TEKST);
    expect(tekst).not.toMatch(/viser spillet/);
  });

  it('forsvinder, når deadlinen er GEMT på spillet', () => {
    vis({ ...HVM2027, puljeLockAt: { toMillis: () => Date.parse('2027-01-13T16:30:00Z') } });
    expect(screen.queryByTestId('mangler-pulje-deadline')).toBeNull();
  });

  it('et udfyldt, men ugemt felt fjerner den ikke', () => {
    vis(HVM2027);
    fireEvent.change(screen.getByLabelText(/Bonus-\/pulje-deadline/), { target: { value: '2027-01-13T17:30' } });
    expect(screen.getByTestId('mangler-pulje-deadline')).toBeInTheDocument();
  });

  it('også et spil med fast deadline (ingen puljeLockRound), der mangler den', () => {
    vis({ id: 'sl', name: 'SL', emoji: '⚽', type: 'football', status: 'open', sync: { provider: 'superliga' }, pulje: { poolSize: 6 } });
    expect(screen.getByTestId('mangler-pulje-deadline').textContent).toBe(SKJULT_TEKST);
  });

  it('ikke for PL (deadlinen udledes af synken), et spil uden pulje eller et afsluttet spil', () => {
    const { unmount } = vis({
      id: 'pl', name: 'PL', emoji: '⚽', type: 'football', status: 'open',
      sync: { provider: 'pulselive' }, pulje: { poolSize: 4, nedSize: 3 }, puljeLockRound: 3,
    });
    expect(screen.queryByTestId('mangler-pulje-deadline')).toBeNull();
    unmount();
    const { unmount: u2 } = vis({ id: 'x', name: 'X', emoji: '⚽', type: 'football', status: 'open' });
    expect(screen.queryByTestId('mangler-pulje-deadline')).toBeNull();
    u2();
    vis({ ...HVM2027, status: 'finished' });
    expect(screen.queryByTestId('mangler-pulje-deadline')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ⚠️ GRUPPERNE (📊 Grupper) I SPIL-TIDSPLAN. Ugyldige grupper slår fanen og
// kortets mærke fra — men ikke tavst. Og hovedrundens grupper udledes af de
// kampe, ejeren lægger ind, så en fejlparret kamp eller et indlagt hold, som
// stillingen ikke har over stregen (QC Q1), skal stå her ved navn.
// ---------------------------------------------------------------------------
describe('Spil-tidsplan — ⚠️ grupperne', async () => {
  const { HVM27G, INDLEDENDE, medFacit, hovedrundeKampe, GRUPPE_A_KNAEK, A_KNAEK_ORDEN } = await import('../../test/hvm2027Grupper');
  const { GAMES } = await import('../../../scripts/games.mjs');
  const IND = medFacit(INDLEDENDE, GRUPPE_A_KNAEK);
  const giv = (kampe) => mockGetDocs.mockResolvedValue({ docs: kampe.map((m) => ({ id: m.id, data: () => m })) });
  const advarsel = async () => (await screen.findByTestId('grupper-advarsel')).textContent;

  beforeEach(() => {
    mockGames.mockReturnValue({ games: [HVM27G], loading: false });
  });

  it('Q1: stillingen siger Tunesien som nr. 3, men Uruguay er lagt ind — ordret', async () => {
    giv([...IND, ...hovedrundeKampe({ A: ['Tyskland', 'Serbien', 'Uruguay'] }, { runder: [8] })]);
    render(<GameScheduleTab />);
    expect(await advarsel()).toContain('⚠️ 📊 Grupper: Gruppe A: stillingen siger Tunesien som nr. 3, men Uruguay er lagt ind i hovedrunden. Tjek facit eller hovedrundens kampe.');
    expect(mockGetDocs).toHaveBeenCalledWith({ __sti: ['games', 'hvm2027', 'matches'] });
  });

  it('en hovedrundekamp på tværs af grupperne nævnes ved navn', async () => {
    const dag8 = hovedrundeKampe({ A: A_KNAEK_ORDEN.slice(0, 3) }, { runder: [8] });
    giv([...IND, ...dag8, { id: 'r8-x', round: 8, home: 'Kroatien', away: 'Tyskland', kickoff: Date.parse('2027-01-20T20:00:00Z') }]);
    render(<GameScheduleTab />);
    const t = await advarsel();
    expect(t).toContain('Kroatien–Tyskland');
    expect(t).toContain('gruppe C og A er ikke i samme gruppe i hovedrunden');
  });

  it('kampe, der stemmer: ingen advarsel', async () => {
    giv([...IND, ...hovedrundeKampe({ A: A_KNAEK_ORDEN.slice(0, 3) }, { runder: [8] })]);
    render(<GameScheduleTab />);
    await waitFor(() => expect(mockGetDocs).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(screen.queryByTestId('grupper-advarsel')).toBeNull();
    expect(screen.queryByTestId('grupper-ugyldige')).toBeNull();
  });

  it('ugyldige grupper: rød linje med grunden — og ingen kamphentning', () => {
    const forkert = { ...HVM27G, grupper: { ...HVM27G.grupper, faser: [HVM27G.grupper.faser[0], { ...HVM27G.grupper.faser[1], fase: 'Hovedrunden' }] } };
    mockGames.mockReturnValue({ games: [forkert], loading: false });
    render(<GameScheduleTab />);
    const linje = screen.getByTestId('grupper-ugyldige').textContent;
    expect(linje).toContain('Grupperne er ugyldige (fanen 📊 Grupper vises ikke)');
    expect(linje).toContain('«Hovedrunden» findes ikke');
    expect(linje).toContain('Kampkortene viser ingen gruppe.');
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('Superligaen: ingen gruppe-linje og INGEN kamphentning ved render', () => {
    mockGames.mockReturnValue({ games: [{ ...GAMES.find((g) => g.id === 'superliga2627'), id: 'superliga2627' }], loading: false });
    render(<GameScheduleTab />);
    expect(screen.queryByTestId('grupper-ugyldige')).toBeNull();
    expect(screen.queryByTestId('grupper-advarsel')).toBeNull();
    expect(mockGetDocs).not.toHaveBeenCalled();
  });
});
