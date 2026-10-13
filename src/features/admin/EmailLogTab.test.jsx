import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockHook = vi.fn();
vi.mock('./useEmailLog', () => ({ useEmailLog: () => mockHook() }));
vi.mock('./adminActions', () => ({ formatTimestamp: () => '11.06.2026 18:00' }));

import EmailLogTab from './EmailLogTab';

describe('EmailLogTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('viser indlæsning', () => {
    mockHook.mockReturnValue({ entries: [], loading: true, error: '' });
    render(<EmailLogTab />);
    expect(screen.getByText(/Henter mail-log/i)).toBeInTheDocument();
  });

  it('viser tom-besked', () => {
    mockHook.mockReturnValue({ entries: [], loading: false, error: '' });
    render(<EmailLogTab />);
    expect(screen.getByText(/Ingen mails sendt endnu/i)).toBeInTheDocument();
  });

  it('viser loglinjer med type, modtager og status', () => {
    mockHook.mockReturnValue({
      loading: false, error: '',
      entries: [
        { id: '1', to: 'a@b.dk', subject: 'Påmindelse', type: 'reminder', status: 'sent', createdAt: {} },
        { id: '2', to: 'c@d.dk', subject: 'Nulstil', type: 'password-reset', status: 'failed', error: 'bounce', createdAt: {} },
      ],
    });
    render(<EmailLogTab />);
    expect(screen.getByText('a@b.dk')).toBeInTheDocument();
    expect(screen.getByText('Kodeord-nulstilling')).toBeInTheDocument();
    expect(screen.getByText(/✓ Sendt/)).toBeInTheDocument();
    expect(screen.getByText(/✗ Fejl/)).toBeInTheDocument();
  });

  // Alarm-postbudet skriver typen 'drift-alarm' (functions-platform/postbud.js
  // MAIL_TYPE). Uden labelen stod den rå type i Mail-loggen — og labelen kunne
  // fjernes eller omdøbes med alt grønt.
  it('viser alarm-postbudets mails som «Driftalarm» — ikke den rå type', () => {
    mockHook.mockReturnValue({
      loading: false, error: '',
      entries: [{ id: '3', to: 'x@y.dk', subject: 'Vejleaa Tip – driftalarm', type: 'drift-alarm', status: 'sent', createdAt: {} }],
    });
    render(<EmailLogTab />);
    expect(screen.getByText('Driftalarm')).toBeInTheDocument();
    expect(screen.queryByText('drift-alarm')).toBeNull();
  });

  it('viser fejlbesked', () => {
    mockHook.mockReturnValue({ entries: [], loading: false, error: 'Kunne ikke hente mail-loggen.' });
    render(<EmailLogTab />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Kunne ikke hente/i);
  });
});
