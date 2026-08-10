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

const TEAMS = [
  { name: 'FC Nordsjælland', short: 'FCN', color: '#B80112', awayColor: '#111111', thirdColor: '#FFD200' },
  { name: 'Brøndby IF', short: 'BIF', color: '#003DA5', awayColor: '#FFFFFF', thirdColor: '#FFD200' },
];
const GAME = { id: 'sl', name: 'Superligaen', teams: TEAMS };

vi.mock('../games/useGames', () => ({ useGames: () => ({ games: [GAME], loading: false }) }));

// Spillet har INGEN gemte overrides — fanen skal selv fylde standarderne ud.
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  getDoc: () => Promise.resolve({ exists: () => true, data: () => ({}) }),
}));

const mockGem = vi.fn().mockResolvedValue({ ok: true });
vi.mock('../games/gameActions', () => ({ setTeamStyles: (...a) => mockGem(...a) }));

import TeamStylesTab from './TeamStylesTab';

beforeEach(() => mockGem.mockClear());

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
    expect(advarsel).toHaveTextContent('Nordsjælland');
    expect(advarsel).toHaveTextContent('FC Nordsjælland');
    expect(advarsel).toHaveTextContent('Brøndby IF');
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
});
