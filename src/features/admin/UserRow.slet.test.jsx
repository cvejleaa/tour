// «Slet bruger»: dialogen lover det, serveren gør, og force tilbydes KUN når
// serveren siger, at fejlen kan forceres (point) — ikke for en liga-ejer.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../firebase', () => ({ auth: { currentUser: { uid: 'ejer' } }, db: {}, functions: {} }));
const mockDelete = vi.fn();
vi.mock('./adminActions', () => ({
  setUserStatus: vi.fn(), setGlobalAdminRole: vi.fn(), sendAdminPasswordReset: vi.fn(), callSetUserEmail: vi.fn(),
  callDeleteUser: (...a) => mockDelete(...a),
}));
vi.mock('../../lib/platform', () => ({ PLATFORM_MODE: true }));

import UserRow from './UserRow';

const bruger = { id: 'x', displayName: 'Dublet Hansen', email: 'd@x.dk', role: 'player', status: 'approved' };
const vis = () => render(<ul><UserRow user={bruger} currentUserIsOwner currentUserCanApprove /></ul>);

beforeEach(() => { vi.clearAllMocks(); global.confirm = vi.fn(() => true); });

describe('UserRow — Slet bruger', () => {
  it('dialogen siger, hvad der slettes, OG hvad der bliver stående — og lover ikke længere «alle spil»', async () => {
    mockDelete.mockResolvedValue({ ok: true, data: {} });
    vis();
    fireEvent.click(screen.getByRole('button', { name: /Slet bruger/ }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('x', false));
    const [tekst] = global.confirm.mock.calls[0];
    expect(tekst).toContain('Slet Dublet Hansen PERMANENT?');
    expect(tekst).toContain('tips på kommende kampe');
    expect(tekst).toContain('bliver stående som arkiv');
    expect(tekst).not.toContain('fjernes fra login og alle spil');
    expect(global.confirm).toHaveBeenCalledTimes(1);
  });

  it('point: serveren siger kanForceres → «Slet alligevel?» → force', async () => {
    mockDelete
      .mockResolvedValueOnce({ ok: false, code: 'functions/failed-precondition', details: { kanForceres: true }, error: 'Brugeren har point i "Superligaen". Bekræft med force for at slette alligevel.' })
      .mockResolvedValueOnce({ ok: true, data: {} });
    vis();
    fireEvent.click(screen.getByRole('button', { name: /Slet bruger/ }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(2));
    expect(mockDelete).toHaveBeenLastCalledWith('x', true);
    expect(global.confirm).toHaveBeenCalledTimes(2);
    expect(global.confirm.mock.calls[1][0]).toContain('Brugeren har point i "Superligaen"');
    expect(global.confirm.mock.calls[1][0]).toContain('Slet alligevel?');
  });

  it('liga-ejer: samme fejlkode, men UDEN kanForceres → ingen «Slet alligevel?», fejlen vises', async () => {
    mockDelete.mockResolvedValueOnce({ ok: false, code: 'functions/failed-precondition', details: null, error: 'Brugeren ejer en liga i "Superligaen". Slet eller overdrag ligaen først.' });
    vis();
    fireEvent.click(screen.getByRole('button', { name: /Slet bruger/ }));
    await waitFor(() => expect(screen.getByText(/ejer en liga i "Superligaen"/)).toBeInTheDocument());
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(global.confirm).toHaveBeenCalledTimes(1);
  });
});
