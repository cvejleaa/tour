// Tests for SettingsTab — "🏁 Afslutning af løbet"-sektionen (global
// automatik-pause + takke-mail). Firebase mockes fuldstændigt.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: { _db: true } }));

// onSnapshot leverer straks et snapshot pr. doc-id, så komponenten er "loaded".
let automationData = null; // data i config/automation (null = findes ikke)
vi.mock('firebase/firestore', () => ({
  doc: (_db, _col, id) => ({ id }),
  onSnapshot: (ref, next) => {
    const data = ref.id === 'automation' ? automationData : {};
    next({ exists: () => data != null, data: () => data ?? {} });
    return () => {};
  },
}));

const mockSetPaused = vi.fn();
const mockSendThanks = vi.fn();
vi.mock('./adminActions', () => ({
  setRecapTime: vi.fn(),
  setUntippedPenalty: vi.fn(),
  callSendTestReminderToMe: vi.fn(),
  callSendTipRemindersNow: vi.fn(),
  callMigrateEmailPrivacy: vi.fn(),
  callSetAutomationPaused: (...a) => mockSetPaused(...a),
  callSendThankYouEmails: (...a) => mockSendThanks(...a),
}));

vi.mock('../leaderboard/useUntippedPenalty', () => ({
  DEFAULT_UNTIPPED_PENALTY: 1,
  readUntippedPenalty: () => 1,
}));

import SettingsTab from './SettingsTab';

describe('SettingsTab — 🏁 Afslutning af løbet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    automationData = null;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('viser sektionen med pause-knap og takke-mail-knapper', () => {
    render(<SettingsTab />);
    expect(screen.getByText('🏁 Afslutning af løbet')).toBeInTheDocument();
    expect(screen.getByTestId('toggle-automation')).toHaveTextContent('Sæt automatik på pause');
    expect(screen.getByText('● Kører')).toBeInTheDocument();
    expect(screen.getByTestId('thankyou-draft')).toBeInTheDocument();
    expect(screen.getByTestId('thankyou-all')).toBeInTheDocument();
  });

  it('viser pause-tilstanden fra config/automation', () => {
    automationData = { paused: true };
    render(<SettingsTab />);
    expect(screen.getByTestId('toggle-automation')).toHaveTextContent('Genoptag automatik');
    expect(screen.getByText('● Sat på pause')).toBeInTheDocument();
  });

  it('sætter pause efter bekræftelse', async () => {
    mockSetPaused.mockResolvedValue({ ok: true, data: { paused: true } });
    render(<SettingsTab />);
    fireEvent.click(screen.getByTestId('toggle-automation'));
    await waitFor(() => expect(mockSetPaused).toHaveBeenCalledWith(true));
    expect(screen.getByText(/Automatikken er sat på pause/)).toBeInTheDocument();
  });

  it('gør intet når bekræftelsen afvises', () => {
    window.confirm.mockReturnValue(false);
    render(<SettingsTab />);
    fireEvent.click(screen.getByTestId('toggle-automation'));
    expect(mockSetPaused).not.toHaveBeenCalled();
  });

  it('udkast sender kun til admin selv (dryRun:true) uden bekræftelse', async () => {
    mockSendThanks.mockResolvedValue({ ok: true, data: { sentTo: 'mig@vejleaa.dk' } });
    render(<SettingsTab />);
    fireEvent.click(screen.getByTestId('thankyou-draft'));
    await waitFor(() => expect(mockSendThanks).toHaveBeenCalledWith({ dryRun: true }));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(screen.getByText(/Udkast sendt til dig \(mig@vejleaa\.dk\)/)).toBeInTheDocument();
  });

  it('send-til-alle kræver DOBBELT bekræftelse (dryRun:false)', async () => {
    mockSendThanks.mockResolvedValue({ ok: true, data: { sent: 12, failed: 1, noEmail: 2 } });
    render(<SettingsTab />);
    fireEvent.click(screen.getByTestId('thankyou-all'));
    await waitFor(() => expect(mockSendThanks).toHaveBeenCalledWith({ dryRun: false }));
    expect(window.confirm).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Sendt til 12 spillere \(1 fejlede, 2 uden mail\)/)).toBeInTheDocument();
  });

  it('afbryder send-til-alle hvis anden bekræftelse afvises', () => {
    window.confirm.mockReturnValueOnce(true).mockReturnValueOnce(false);
    render(<SettingsTab />);
    fireEvent.click(screen.getByTestId('thankyou-all'));
    expect(mockSendThanks).not.toHaveBeenCalled();
  });

  it('viser fejlbesked når kaldet fejler', async () => {
    mockSendThanks.mockResolvedValue({ ok: false, error: 'SMTP_PASSWORD er ikke sat endnu.' });
    render(<SettingsTab />);
    fireEvent.click(screen.getByTestId('thankyou-draft'));
    await waitFor(() => expect(screen.getByText(/SMTP_PASSWORD er ikke sat endnu/)).toBeInTheDocument());
  });
});
