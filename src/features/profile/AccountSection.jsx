/**
 * AccountSection — "Konto & login" på profilsiden.
 * Lader brugeren:
 *   - se sin(e) login-metode(r) (Google / e-mail),
 *   - skifte KONTAKT-mailen (hvor påmindelser sendes hen),
 *   - skifte LOGIN-mailen (Firebase-kontoen; sender en bekræftelses-mail til den
 *     nye adresse — login-mailen skifter først når linket er klikket),
 *   - koble Google-login på kontoen (så man fremover også kan logge ind med Google).
 */
import { useState } from 'react';
import {
  updateContactEmail, changeLoginEmail, linkGoogleLogin, hasProvider,
} from './profileActions';

function Status({ state }) {
  if (!state) return null;
  const ok = state.kind === 'ok';
  return (
    <p
      className={`badge ${ok ? 'badge--green' : 'badge--red'} mt-1`}
      role={ok ? 'status' : 'alert'}
      style={{ display: 'block' }}
    >
      {state.text}
    </p>
  );
}

export default function AccountSection({ user, uid }) {
  const isPassword = hasProvider(user, 'password');
  const isGoogle = hasProvider(user, 'google.com');

  const [contactEmail, setContactEmail] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState('');    // 'contact' | 'login' | 'google' | ''
  const [state, setState] = useState(null); // { kind, text }

  async function saveContact(e) {
    e.preventDefault();
    setBusy('contact'); setState(null);
    try {
      const em = await updateContactEmail(uid, contactEmail);
      setState({ kind: 'ok', text: `Påmindelser sendes nu til ${em}.` });
      setContactEmail('');
    } catch (err) {
      setState({ kind: 'err', text: err.message });
    } finally { setBusy(''); }
  }

  async function saveLogin(e) {
    e.preventDefault();
    setBusy('login'); setState(null);
    try {
      const em = await changeLoginEmail({ uid, newEmail: loginEmail, currentPassword: password });
      setState({ kind: 'ok', text: `Vi har sendt en bekræftelses-mail til ${em}. Klik linket dér for at gøre den til din nye login-mail. Påmindelser sendes allerede til den nye adresse.` });
      setLoginEmail(''); setPassword('');
    } catch (err) {
      setState({ kind: 'err', text: err.message });
    } finally { setBusy(''); }
  }

  async function linkGoogle() {
    setBusy('google'); setState(null);
    try {
      await linkGoogleLogin();
      setState({ kind: 'ok', text: 'Google-login er nu koblet på din konto — du kan fremover logge ind med Google.' });
    } catch (err) {
      setState({ kind: 'err', text: err.message });
    } finally { setBusy(''); }
  }

  const inputStyle = { maxWidth: 280 };

  return (
    <div
      className="form-group mt-2"
      style={{ borderTop: '1px solid var(--c-border)', paddingTop: '1rem' }}
      data-testid="account-section"
    >
      <label className="form-label">Konto &amp; login</label>

      {/* Nuværende login-metode(r) */}
      <div className="flex gap-1" style={{ alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--c-muted)' }}>Logger ind med:</span>
        {isGoogle && <span className="badge badge--blue">🔵 Google</span>}
        {isPassword && <span className="badge badge--muted">✉️ E-mail</span>}
        {!isGoogle && !isPassword && <span className="badge badge--muted">❔ Ukendt</span>}
      </div>

      <Status state={state} />

      {/* Kontakt-mail (hvor påmindelser sendes hen) */}
      <form onSubmit={saveContact} style={{ marginTop: '0.75rem' }}>
        <label className="form-label" htmlFor="contact-email" style={{ fontSize: '0.85rem' }}>
          Kontakt-mail (hvor påmindelser sendes hen)
        </label>
        <div className="flex gap-1" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            id="contact-email" className="input" type="email" value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)} placeholder="ny@mail.dk"
            style={inputStyle} data-testid="contact-email"
          />
          <button className="btn btn--sm" type="submit" disabled={busy === 'contact' || !contactEmail.trim()}>
            {busy === 'contact' ? 'Gemmer…' : 'Skift kontakt-mail'}
          </button>
        </div>
      </form>

      {/* Login-mail — kun for e-mail/kodeord-konti (Google styrer selv sin mail) */}
      {isPassword && (
        <form onSubmit={saveLogin} style={{ marginTop: '1rem' }}>
          <label className="form-label" htmlFor="login-email" style={{ fontSize: '0.85rem' }}>
            Login-mail (kræver bekræftelses-mail til den nye adresse)
          </label>
          <div className="flex gap-1" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              id="login-email" className="input" type="email" value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)} placeholder="ny@mail.dk"
              style={inputStyle} data-testid="login-email"
            />
            <input
              className="input" type="password" value={password} autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)} placeholder="Nuværende adgangskode"
              style={inputStyle} data-testid="login-password"
            />
            <button className="btn btn--sm" type="submit" disabled={busy === 'login' || !loginEmail.trim() || !password}>
              {busy === 'login' ? 'Sender…' : 'Skift login-mail'}
            </button>
          </div>
        </form>
      )}

      {/* Kobl Google på kontoen (skift fra e-mail til Google-login) */}
      {!isGoogle && (
        <div style={{ marginTop: '1rem' }}>
          <button className="btn btn--ghost btn--sm" type="button" onClick={linkGoogle} disabled={busy === 'google'} data-testid="link-google">
            {busy === 'google' ? 'Kobler…' : '🔵 Skift til / tilføj Google-login'}
          </button>
          <span style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.8rem', color: 'var(--c-muted)' }}>
            Kobl din Google-konto på, så du fremover kan logge ind med Google i stedet for e-mail og adgangskode.
          </span>
        </div>
      )}
    </div>
  );
}
