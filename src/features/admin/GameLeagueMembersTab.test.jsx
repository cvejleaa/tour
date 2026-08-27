import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import GameLeagueMembersTab from './GameLeagueMembersTab';

const mockGames = vi.fn();
vi.mock('../games/useGames', () => ({ useGames: () => mockGames() }));

const mockHent = vi.fn();
const mockSaet = vi.fn();
vi.mock('./adminActions', () => ({
  callHentLigaMedlemmer: (...a) => mockHent(...a),
  callSaetLigaMedlem: (...a) => mockSaet(...a),
}));

const SPIL = [{ id: 'sl', name: 'Superligaen' }, { id: 'pl', name: 'Premier League' }];
const DATA = {
  ligaer: [{
    id: 'L1',
    navn: 'Vennerne',
    ownerUid: 'ejer',
    medlemmer: [{ uid: 'ejer', navn: 'Anne' }, { uid: 'med', navn: 'Bo' }],
  }],
  deltagere: [
    { uid: 'ejer', navn: 'Anne' }, { uid: 'med', navn: 'Bo' }, { uid: 'fri', navn: 'Carl' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGames.mockReturnValue({ games: SPIL, loading: false });
  mockHent.mockResolvedValue({ ok: true, data: DATA });
  mockSaet.mockResolvedValue({ ok: true, data: { aendret: true, medlem: true } });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('GameLeagueMembersTab', () => {
  it('henter for det valgte spil og viser medlemmerne', async () => {
    render(<GameLeagueMembersTab />);
    await waitFor(() => expect(mockHent).toHaveBeenCalledWith('sl'));
    expect(await screen.findByText('Vennerne')).toBeInTheDocument();
    expect(screen.getByText('Anne')).toBeInTheDocument();
    expect(screen.getByText('2 medlemmer')).toBeInTheDocument();
  });

  it('henter igen, når spillet skiftes', async () => {
    render(<GameLeagueMembersTab />);
    await waitFor(() => expect(mockHent).toHaveBeenCalledWith('sl'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Vælg spil' }), { target: { value: 'pl' } });
    await waitFor(() => expect(mockHent).toHaveBeenCalledWith('pl'));
  });

  it('tilbyder KUN deltagere, der ikke allerede er medlem', async () => {
    render(<GameLeagueMembersTab />);
    const vaelger = await screen.findByRole('combobox', { name: /Vælg spiller til Vennerne/i });
    const navne = [...vaelger.querySelectorAll('option')].map((o) => o.textContent);
    expect(navne).toEqual(['Vælg spiller…', 'Carl']);
  });

  it('ADVARER om at hele historikken afsløres BEGGE veje, før nogen meldes ind', async () => {
    // Det er den farlige vej: applyBetLeagueDelta rører ALLE spillerens tips,
    // ikke kun fremtidige. Knapteksten skal love præcis det, den gør.
    render(<GameLeagueMembersTab />);
    const vaelger = await screen.findByRole('combobox', { name: /Vælg spiller til Vennerne/i });
    fireEvent.change(vaelger, { target: { value: 'fri' } });
    fireEvent.click(screen.getByRole('button', { name: 'Meld ind' }));
    const tekst = window.confirm.mock.calls[0][0];
    expect(tekst).toContain('ALLE ligaens tidligere tips');
    expect(tekst).toContain('kan se alle hans');
    expect(tekst).toMatch(/ikke kun kommende runder/);
    await waitFor(() => expect(mockSaet).toHaveBeenCalledWith({
      gameId: 'sl', leagueId: 'L1', maalUid: 'fri', medlem: true,
    }));
  });

  it('gør INTET, hvis man fortryder i dialogen', async () => {
    window.confirm.mockReturnValue(false);
    render(<GameLeagueMembersTab />);
    const vaelger = await screen.findByRole('combobox', { name: /Vælg spiller til Vennerne/i });
    fireEvent.change(vaelger, { target: { value: 'fri' } });
    fireEvent.click(screen.getByRole('button', { name: 'Meld ind' }));
    expect(mockSaet).not.toHaveBeenCalled();
  });

  it('ADVARER om den tomme stilling og de efterladte opslag, før nogen meldes ud', async () => {
    render(<GameLeagueMembersTab />);
    await screen.findByText('Bo');
    fireEvent.click(screen.getByRole('button', { name: 'Meld ud' }));
    const tekst = window.confirm.mock.calls[0][0];
    // HOVEDKONSEKVENSEN først. Uden denne assertion overlevede en mutation,
    // der udvandede linjen til "OK?" — bivirkningerne var dækket, men ikke
    // det, handlingen faktisk gør.
    expect(tekst).toMatch(/mister adgangen til ligaens tips og væg/);
    expect(tekst).toContain('Bo');
    expect(tekst).toContain('Vennerne');
    expect(tekst).toMatch(/TOM stilling/);
    expect(tekst).toMatch(/uden fejlbesked/);
    expect(tekst).toMatch(/opslag på ligavæggen bliver stående/);
    // Og at det KAN fortrydes — ellers tør ingen bruge knappen.
    expect(tekst).toMatch(/ingen point går tabt/);
  });

  it('viser INGEN meld-ud-knap for ligaens ejer', async () => {
    // En ejerløs liga er en tilstand, ingen flade kan rette. Serveren afviser
    // det også, men knappen må ikke findes.
    render(<GameLeagueMembersTab />);
    await screen.findByText('Anne');
    expect(screen.getAllByRole('button', { name: 'Meld ud' })).toHaveLength(1);
    expect(screen.getByText('ejer')).toBeInTheDocument();
  });

  it('siger til, når alle deltagere allerede er medlem', async () => {
    mockHent.mockResolvedValue({
      ok: true,
      data: { ...DATA, deltagere: [{ uid: 'ejer', navn: 'Anne' }, { uid: 'med', navn: 'Bo' }] },
    });
    render(<GameLeagueMembersTab />);
    expect(await screen.findByText(/alle spillets deltagere er allerede medlem/i)).toBeInTheDocument();
  });

  it('siger til, når spillet slet ingen deltagere har', async () => {
    mockHent.mockResolvedValue({ ok: true, data: { ...DATA, deltagere: [] } });
    render(<GameLeagueMembersTab />);
    expect(await screen.findByText(/ingen deltagere i spillet endnu/i)).toBeInTheDocument();
  });

  it('henviser til, HVOR en liga oprettes, når spillet ingen har', async () => {
    mockHent.mockResolvedValue({ ok: true, data: { ligaer: [], deltagere: [] } });
    render(<GameLeagueMembersTab />);
    expect(await screen.findByText(/ingen ligaer i dette spil endnu/i)).toBeInTheDocument();
    expect(screen.getByText(/Ligaer/)).toBeInTheDocument();
  });

  it('viser serverens fejl frem for en tom liste', async () => {
    // "Regler er ikke filtre": en afvist læsning må aldrig se ud som nul ligaer.
    mockHent.mockResolvedValue({ ok: false, error: 'Kun en administrator kan ændre liga-medlemmer.' });
    render(<GameLeagueMembersTab />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Kun en administrator/);
    expect(screen.queryByText(/ingen ligaer i dette spil/i)).not.toBeInTheDocument();
  });

  it('siger det, når intet blev ændret — frem for at melde succes', async () => {
    mockSaet.mockResolvedValue({ ok: true, data: { aendret: false, medlem: true } });
    render(<GameLeagueMembersTab />);
    const vaelger = await screen.findByRole('combobox', { name: /Vælg spiller til Vennerne/i });
    fireEvent.change(vaelger, { target: { value: 'fri' } });
    fireEvent.click(screen.getByRole('button', { name: 'Meld ind' }));
    expect(await screen.findByText(/var allerede medlem — intet ændret/i)).toBeInTheDocument();
  });
});
