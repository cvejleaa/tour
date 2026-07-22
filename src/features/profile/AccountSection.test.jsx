import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const updateContactEmail = vi.fn(async (uid, e) => e.toLowerCase());
const changeLoginEmail = vi.fn(async () => 'ny@mail.dk');
const linkGoogleLogin = vi.fn(async () => ({ email: 'g@gmail.com' }));

vi.mock('./profileActions', () => ({
  updateContactEmail: (...a) => updateContactEmail(...a),
  changeLoginEmail: (...a) => changeLoginEmail(...a),
  linkGoogleLogin: (...a) => linkGoogleLogin(...a),
  hasProvider: (user, id) => !!(user?.providerData || []).some((p) => p.providerId === id),
}));

import AccountSection from './AccountSection';

const passwordUser = { email: 'a@b.dk', providerData: [{ providerId: 'password' }] };
const googleUser = { email: 'a@b.dk', providerData: [{ providerId: 'google.com' }] };

describe('AccountSection', () => {
  beforeEach(() => { updateContactEmail.mockClear(); changeLoginEmail.mockClear(); linkGoogleLogin.mockClear(); });

  it('viser login-mail-form og Google-knap for e-mail-konti', () => {
    render(<AccountSection user={passwordUser} uid="u1" />);
    expect(screen.getByTestId('login-email')).toBeInTheDocument();
    expect(screen.getByTestId('link-google')).toBeInTheDocument();
    expect(screen.getByText('✉️ E-mail')).toBeInTheDocument();
  });

  it('skjuler login-mail-form og Google-knap for Google-konti', () => {
    render(<AccountSection user={googleUser} uid="u1" />);
    expect(screen.queryByTestId('login-email')).not.toBeInTheDocument();
    expect(screen.queryByTestId('link-google')).not.toBeInTheDocument();
    expect(screen.getByText('🔵 Google')).toBeInTheDocument();
  });

  it('kalder updateContactEmail ved skift af kontakt-mail', async () => {
    render(<AccountSection user={googleUser} uid="u1" />);
    fireEvent.change(screen.getByTestId('contact-email'), { target: { value: 'ny@mail.dk' } });
    fireEvent.click(screen.getByRole('button', { name: /Skift kontakt-mail/i }));
    await waitFor(() => expect(updateContactEmail).toHaveBeenCalledWith('u1', 'ny@mail.dk'));
  });

  it('kalder linkGoogleLogin ved klik på Google-knappen', async () => {
    render(<AccountSection user={passwordUser} uid="u1" />);
    fireEvent.click(screen.getByTestId('link-google'));
    await waitFor(() => expect(linkGoogleLogin).toHaveBeenCalled());
  });
});
