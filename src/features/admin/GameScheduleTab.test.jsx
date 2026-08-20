// Tests for GameScheduleTab — især status-vælgeren, der afgør om et spil står
// som "Afsluttet". Statussen har konsekvenser (spillet ryger ud af "Åbne spil",
// påmindelser stopper), så den må hverken skrives utilsigtet eller kunne sættes
// til en værdi, visningen ikke kender.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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
vi.mock('./adminActions', () => ({
  callRecomputeGameScores: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  callBackfillPlayerLeagues: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  callRepriceGameOdds: (...a) => mockReprice(...a),
  callSyncGameKickoffs: (...a) => mockSyncKickoffs(...a),
}));

// Kamplisten til rundevælgeren hentes med getDocs — den hentes FØRST når
// ejeren beder om at vælge en runde, og attrappen skal kunne bevise begge dele.
const mockGetDocs = vi.fn();
vi.mock('firebase/firestore', () => ({
  collection: (...a) => ({ __sti: a.slice(1) }),
  getDocs: (...a) => mockGetDocs(...a),
}));

import GameScheduleTab, { byggSchedulePatch } from './GameScheduleTab';

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

  // Spil-dokumentet skrives også af serveren (fx standings hvert kvarter).
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
    expect(standard.textContent).toMatch(/runde 2/);
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
    type: 'football', status: 'open',
    pulje: { poolSize: 4, nedSize: 3 }, puljeLockRound: 3,
  };
  // Superligaen: pulje MEN fast dato (ingen puljeLockRound) — feltet skal blive
  // ved med at være redigerbart, og synk-knappen må IKKE dukke op.
  const SL = {
    id: 'sl', name: 'Superligaen', emoji: '⚽', type: 'football', status: 'live',
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
    expect(screen.getByText(/udledt af runde 3/i)).toBeInTheDocument();
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

  it('viser IKKE synk-knappen for et spil uden puljeLockRound — og lader deadline-feltet være redigerbart', () => {
    mockGames.mockReturnValue({ games: [SL], loading: false });
    render(<GameScheduleTab />);
    expect(screen.queryByRole('button', { name: /Synk kamptider nu/i })).not.toBeInTheDocument();
    // SL's deadline sættes stadig i hånden.
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
