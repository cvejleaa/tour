import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: {}, functions: {} }));

const mockSend = vi.fn(() => Promise.resolve({ ok: true, data: { sent: 3, total: 3, failed: [] } }));
vi.mock('./adminActions', () => ({ callSendBroadcastEmail: (...a) => mockSend(...a) }));

vi.mock('./useUsers', () => ({
  useUsers: () => ({
    users: [
      { id: 'a', status: 'approved', email: 'mor@x.dk' },
      { id: 'b', status: 'approved', email: 'far@x.dk' },
      { id: 'c', status: 'pending', email: 'ny@x.dk' },     // ikke godkendt → med ikke
      { id: 'd', status: 'approved' },                       // ingen mail → med ikke
    ],
    loading: false, error: '',
  }),
}));

import BroadcastTab from './BroadcastTab';

describe('BroadcastTab', () => {
  beforeEach(() => { mockSend.mockClear(); vi.spyOn(window, 'confirm').mockReturnValue(true); });

  it('indsætter kun godkendte spilleres mails (med adresse)', () => {
    render(<BroadcastTab />);
    expect(screen.getByTestId('broadcast-add-approved').textContent).toMatch(/\(2\)/);
    fireEvent.click(screen.getByTestId('broadcast-add-approved'));
    const ta = screen.getByTestId('broadcast-recipients');
    expect(ta.value).toContain('mor@x.dk');
    expect(ta.value).toContain('far@x.dk');
    expect(ta.value).not.toContain('ny@x.dk');
    expect(screen.getByTestId('broadcast-count').textContent).toMatch(/2 gyldige/);
  });

  it('sender beskeden med emne, tekst og gyldige modtagere', async () => {
    render(<BroadcastTab />);
    fireEvent.change(screen.getByTestId('broadcast-recipients'), { target: { value: 'a@b.dk, ugyldig' } });
    fireEvent.click(screen.getByTestId('broadcast-send'));
    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    const arg = mockSend.mock.calls[0][0];
    expect(arg.recipients).toEqual(['a@b.dk']); // ugyldig frasorteret
    expect(arg.subject).toBeTruthy();
    expect(arg.body).toBeTruthy();
  });
});
