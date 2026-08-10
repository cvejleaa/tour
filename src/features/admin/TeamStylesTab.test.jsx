// ---------------------------------------------------------------------------
// Admin-fanen 🎨 Hold-farver og navne.
//
// HELE KOMPONENTEN KUNNE SÆTTES TIL `return null` MED GRØN SUITE — filen blev
// ikke indlæst af én eneste test. Reglerne for HVAD der gemmes ligger nu i
// `teamStylesOverrides.js` og er dækket der; det her er de tre ting, der kun
// findes i komponenten:
//
//   1. at fanen overhovedet tegner noget
//   2. at Gem sender det byggede objekt videre — ikke felternes råtilstand
//   3. at dublet-advarslen står FØR der gemmes, ikke bagefter
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('../../components/ClubBadge', () => ({ default: () => <span /> }));

// Tre hold, ikke to: dublet-advarslens tælling skal kunne prøves med BÅDE to
// og tre hold på samme navn, og med to hold kan "Flere hold"-grenen ikke nås.
const TEAMS = [
  { name: 'FC Nordsjælland', short: 'FCN', color: '#B80112', awayColor: '#111111', thirdColor: '#FFD200' },
  { name: 'Brøndby IF', short: 'BIF', color: '#003DA5', awayColor: '#FFFFFF', thirdColor: '#FFD200' },
  { name: 'Silkeborg IF', short: 'SIF', color: '#CA202C', awayColor: '#FFFFFF', thirdColor: '#003DA5' },
];
const GAME = { id: 'sl', name: 'Superligaen', teams: TEAMS };

vi.mock('../games/useGames', () => ({ useGames: () => ({ games: [GAME], loading: false }) }));

// Hvad spillet har gemt i forvejen. Sættes pr. test, så den samme fil kan
// dække BÅDE et jomfrueligt spil og et med eksisterende overrides.
let gemt = {};
let getDocFejler = false;
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  getDoc: () => (getDocFejler
    ? Promise.reject(new Error('offline'))
    : Promise.resolve({ exists: () => true, data: () => ({ teamStyles: gemt }) })),
}));

const mockGem = vi.fn().mockResolvedValue({ ok: true });
vi.mock('../games/gameActions', () => ({ setTeamStyles: (...a) => mockGem(...a) }));

import TeamStylesTab from './TeamStylesTab';

beforeEach(() => { mockGem.mockClear(); gemt = {}; getDocFejler = false; });

/** Vent til fanen har hentet spillet og er holdt op med at vise spinneren. */
const klar = () => waitFor(() => expect(screen.getByLabelText('Visningsnavn for Brøndby IF')).toBeInTheDocument());

describe('TeamStylesTab', () => {
  it('viser et visningsnavn-felt pr. hold, forudfyldt med husets forslag', async () => {
    render(<TeamStylesTab />);
    await klar();
    // Forslaget, ikke det rå navn — det er hele pointen med at forudfylde.
    expect(screen.getByLabelText('Visningsnavn for FC Nordsjælland')).toHaveValue('Nordsjælland');
    // Og et hold uden forslag står med sit eget navn, ikke tomt.
    expect(screen.getByLabelText('Visningsnavn for Brøndby IF')).toHaveValue('Brøndby IF');
  });

  // BÆRENDE. Uden den her kunne Gem sende felternes råtilstand af sted, og så
  // ville hvert hold i spillet få skrevet en override, ingen har bedt om.
  it('gemmer et TOMT objekt, når intet er ændret', async () => {
    render(<TeamStylesTab />);
    await klar();
    fireEvent.click(screen.getByRole('button', { name: /Gem farver og navne/ }));
    await waitFor(() => expect(mockGem).toHaveBeenCalled());
    expect(mockGem).toHaveBeenCalledWith('sl', {});
  });

  it('gemmer kun det hold, hvis navn er ændret', async () => {
    render(<TeamStylesTab />);
    await klar();
    fireEvent.change(screen.getByLabelText('Visningsnavn for Brøndby IF'), { target: { value: 'Brøndby' } });
    fireEvent.click(screen.getByRole('button', { name: /Gem farver og navne/ }));
    await waitFor(() => expect(mockGem).toHaveBeenCalled());
    expect(mockGem).toHaveBeenCalledWith('sl', { 'Brøndby IF': { visningsnavn: 'Brøndby' } });
  });

  // DUBLET-ADVARSLEN SKAL STÅ FØR, DER GEMMES. Opdages "Nordsjælland" to gange
  // først på kampkortet, er den allerede live for alle.
  it('advarer om to hold med samme viste navn — og siger HVILKE', async () => {
    render(<TeamStylesTab />);
    await klar();
    expect(screen.queryByTestId('dublet-advarsel')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Visningsnavn for Brøndby IF'), { target: { value: 'Nordsjælland' } });
    const advarsel = screen.getByTestId('dublet-advarsel');
    // Assertér på INDHOLDET. En test på "advarslen blev vist" ville bestå,
    // selv om teksten var "OK?" — og admin skal kunne se hvilke to hold.
    //
    // MED CITATIONSTEGN OG PARENTES. Et blot `toHaveTextContent('Nordsjælland')`
    // er også sandt af "FC Nordsjælland" i holdlisten lige efter — så selve det
    // dublerede navn kunne droppes ud af sætningen, uden at testen faldt.
    expect(advarsel).toHaveTextContent('"Nordsjælland" (');
    expect(advarsel).toHaveTextContent('FC Nordsjælland og Brøndby IF');
    expect(advarsel).toHaveTextContent('To hold ville hedde det samme');
  });

  // Tælleren skal følge antallet af HOLD, ikke antallet af grupper: tre hold på
  // samme navn er ÉN gruppe, og "To hold" ville da være forkert. Sætningen var
  // hårdkodet, og en advarsel, der tæller forkert, er svær at tro på.
  it('siger "Flere hold", når tre hold deler navn', async () => {
    render(<TeamStylesTab />);
    await klar();
    for (const hold of ['Brøndby IF', 'FC Nordsjælland', 'Silkeborg IF']) {
      fireEvent.change(screen.getByLabelText(`Visningsnavn for ${hold}`), { target: { value: 'Ens' } });
    }
    const advarsel = screen.getByTestId('dublet-advarsel');
    expect(advarsel).toHaveTextContent('Flere hold ville hedde det samme');
    expect(advarsel).not.toHaveTextContent('To hold');
    // Alle tre skal nævnes — ikke bare de to første.
    expect(advarsel).toHaveTextContent('Brøndby IF');
    expect(advarsel).toHaveTextContent('FC Nordsjælland');
    expect(advarsel).toHaveTextContent('Silkeborg IF');
  });

  // …men den må ikke SPÆRRE. Der findes ligaer med to klubber, man dagligt
  // kalder det samme, og admin må selv afgøre det.
  it('spærrer ikke for at gemme trods dublet', async () => {
    render(<TeamStylesTab />);
    await klar();
    fireEvent.change(screen.getByLabelText('Visningsnavn for Brøndby IF'), { target: { value: 'Nordsjælland' } });
    fireEvent.click(screen.getByRole('button', { name: /Gem farver og navne/ }));
    await waitFor(() => expect(mockGem).toHaveBeenCalled());
    expect(mockGem).toHaveBeenCalledWith('sl', { 'Brøndby IF': { visningsnavn: 'Nordsjælland' } });
  });

  // ↺ SKAL KUNNE RYDDE OP IGEN. Knappen var det, der afslørede, at
  // `setDoc(merge: true)` ikke kunne fjerne et felt — den så ud til at virke,
  // og det gamle navn kom tilbage ved næste indlæsning.
  it('nulstiller feltet til husets forslag med ↺', async () => {
    render(<TeamStylesTab />);
    await klar();
    const felt = screen.getByLabelText('Visningsnavn for FC Nordsjælland');
    fireEvent.change(felt, { target: { value: 'Farum' } });
    fireEvent.click(screen.getByTitle('Nulstil til "Nordsjælland"'));
    expect(felt).toHaveValue('Nordsjælland');

    fireEvent.click(screen.getByRole('button', { name: /Gem farver og navne/ }));
    await waitFor(() => expect(mockGem).toHaveBeenCalled());
    expect(mockGem).toHaveBeenCalledWith('sl', {});
  });

  // -------------------------------------------------------------------------
  // ET SPIL, DER ALLEREDE HAR GEMTE OVERRIDES.
  //
  // Indlæsningen var helt ubevist: alle tests brugte `teamStyles: {}`. Både
  // navne- og farve-fletningen kunne skæres ned til "brug altid standarden"
  // med grøn suite — og konsekvensen er ikke kosmetisk. Fanen ville vise
  // standarden, `byggOverrides` ville så bygge et TOMT objekt, og `updateDoc`
  // ERSTATTER: admins gemte navne og farver ville blive slettet, første gang
  // nogen åbnede fanen og trykkede Gem. Præcis den klasse fejl, som hele
  // updateDoc-rettelsen findes for.
  // -------------------------------------------------------------------------
  describe('med gemte overrides', () => {
    it('viser det GEMTE visningsnavn, ikke husets forslag', async () => {
      gemt = { 'FC Nordsjælland': { visningsnavn: 'Farum' } };
      render(<TeamStylesTab />);
      await klar();
      expect(screen.getByLabelText('Visningsnavn for FC Nordsjælland')).toHaveValue('Farum');
    });

    it('viser den GEMTE farve, ikke holdets standardfarve', async () => {
      gemt = { 'Brøndby IF': { color: '#ABCDEF' } };
      render(<TeamStylesTab />);
      await klar();
      // Tekstfeltet ved siden af farvevælgeren bærer værdien.
      expect(screen.getByLabelText('Hjemmefarve for Brøndby IF som kode')).toHaveValue('#ABCDEF');
    });

    // BÆRENDE. Åbn fanen, rør intet, tryk Gem — det gemte skal komme uændret
    // tilbage. Går indlæsningen tabt, gemmes `{}`, og alt er væk.
    it('gemmer det uændrede gemte tilbage som samme override', async () => {
      gemt = {
        'FC Nordsjælland': { visningsnavn: 'Farum', color: '#ABCDEF' },
        'Brøndby IF': { visningsnavn: 'Vestegnen' },
      };
      render(<TeamStylesTab />);
      await klar();
      fireEvent.click(screen.getByRole('button', { name: /Gem farver og navne/ }));
      await waitFor(() => expect(mockGem).toHaveBeenCalled());
      expect(mockGem).toHaveBeenCalledWith('sl', gemt);
    });

    // En gemt værdi, der IKKE er en gyldig hex, må ikke vises som en farve —
    // og må heller ikke gemmes videre.
    it('ignorerer en gemt farve, der ikke er en gyldig hex', async () => {
      gemt = { 'Brøndby IF': { color: 'rød' } };
      render(<TeamStylesTab />);
      await klar();
      expect(screen.getByLabelText('Hjemmefarve for Brøndby IF som kode')).toHaveValue('#003DA5');
      fireEvent.click(screen.getByRole('button', { name: /Gem farver og navne/ }));
      await waitFor(() => expect(mockGem).toHaveBeenCalled());
      expect(mockGem).toHaveBeenCalledWith('sl', {});
    });
  });

  // -------------------------------------------------------------------------
  // HALVSKREVNE FARVEKODER SPÆRRER FOR AT GEMME.
  //
  // `byggOverrides` springer et ugyldigt felt over. Det var harmløst med
  // `setDoc(merge: true)` — den gamle værdi blev stående. Med `updateDoc`
  // ERSTATTES mappet, så `#12345` sletter holdets gemte farve, mens fladen
  // kvitterer med "gemt". En tavs no-op blev til et tavst tab.
  // -------------------------------------------------------------------------
  describe('ugyldig farvekode', () => {
    const skrivHalvHex = async () => {
      gemt = { 'Brøndby IF': { color: '#ABCDEF' } };
      render(<TeamStylesTab />);
      await klar();
      fireEvent.change(screen.getByLabelText('Hjemmefarve for Brøndby IF som kode'), { target: { value: '#12345' } });
    };

    it('gemmer ikke, og siger hvilket hold og felt der er galt', async () => {
      await skrivHalvHex();
      const fejl = screen.getByTestId('hex-fejl');
      expect(fejl).toHaveTextContent('Brøndby IF');
      expect(fejl).toHaveTextContent('Hjemme');
      expect(fejl).toHaveTextContent('#12345');

      fireEvent.click(screen.getByRole('button', { name: /Gem farver og navne/ }));
      // Ingen mikrotask-ventetid her: pointen er, at der ALDRIG kaldes.
      await Promise.resolve();
      expect(mockGem).not.toHaveBeenCalled();
    });

    it('deaktiverer Gem-knappen', async () => {
      await skrivHalvHex();
      expect(screen.getByRole('button', { name: /Gem farver og navne/ })).toBeDisabled();
    });

    // Advarslen skal også stå NEDE VED KNAPPEN. Med 12-20 hold er den i toppen
    // for længst scrollet ud af skærmen, når man trykker Gem.
    it('gentager fejlen ved Gem-knappen', async () => {
      await skrivHalvHex();
      expect(screen.getByTestId('hex-fejl-gem')).toHaveTextContent('Brøndby IF');
    });

    it('slipper igen, når koden er hel', async () => {
      await skrivHalvHex();
      fireEvent.change(screen.getByLabelText('Hjemmefarve for Brøndby IF som kode'), { target: { value: '#123456' } });
      expect(screen.queryByTestId('hex-fejl')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Gem farver og navne/ }));
      await waitFor(() => expect(mockGem).toHaveBeenCalled());
      expect(mockGem).toHaveBeenCalledWith('sl', { 'Brøndby IF': { color: '#123456' } });
    });

    // Et TOMT felt er ikke en fejl — det betyder "brug standardfarven".
    it('spærrer ikke for et tomt farvefelt', async () => {
      render(<TeamStylesTab />);
      await klar();
      fireEvent.change(screen.getByLabelText('Hjemmefarve for Brøndby IF som kode'), { target: { value: '' } });
      expect(screen.queryByTestId('hex-fejl')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Gem farver og navne/ })).not.toBeDisabled();
    });
  });

  // FEJLER INDLÆSNINGEN, MÅ DER IKKE GEMMES. Ellers står formularen med lutter
  // standardværdier, og et tryk på Gem sletter alt, spillet havde.
  it('gemmer ikke, hvis spillets gemte data ikke kunne hentes', async () => {
    getDocFejler = true;
    render(<TeamStylesTab />);
    await waitFor(() => expect(screen.getByText(/Kunne ikke hente/)).toBeInTheDocument());
    const knap = screen.getByRole('button', { name: /Gem farver og navne/ });
    expect(knap).toBeDisabled();
    fireEvent.click(knap);
    await Promise.resolve();
    expect(mockGem).not.toHaveBeenCalled();
  });
});
