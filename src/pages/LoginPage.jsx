// Login- og registreringsside med to faner.
// Håndterer sign-in, opret-bruger og glemt-adgangskode.
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAuthActions } from '../features/auth/useAuthActions';
import { getPendingJoinCode } from '../features/leagues/joinLink';
import { HOME_PATH, PLATFORM_MODE } from '../lib/platform';

// Interne fane-konstanter
const TAB_LOGIN  = 'login';
const TAB_SIGNUP = 'signup';

export default function LoginPage() {
  const { user, isApproved } = useAuth();
  const navigate = useNavigate();
  const { loading, error, clearError, signup, login, resetPassword, signInWithGoogle } = useAuthActions();

  const [tab, setTab]             = useState(TAB_LOGIN);
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [displayName, setDName]   = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [localError, setLocalError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Redirect hvis allerede logget ind. Kom man fra et invitationslink
  // (gemt kode), fortsættes til /tilmeld så ligaen faktisk indløses —
  // ellers ville en godkendt bruger lande på forsiden med koden ubrugt.
  useEffect(() => {
    if (!user) return;
    if (!isApproved) {
      navigate('/afventer', { replace: true });
    } else if (getPendingJoinCode()) {
      navigate('/tilmeld', { replace: true });
    } else {
      navigate(HOME_PATH, { replace: true });
    }
  }, [user, isApproved, navigate]);

  function switchTab(t) {
    setTab(t);
    clearError();
    setLocalError('');
    setSuccessMsg('');
    setShowReset(false);
    setResetSent(false);
  }

  // Validering af opret-bruger-formular
  function validateSignup() {
    if (!displayName.trim()) return 'Angiv venligst et visningsnavn.';
    if (displayName.trim().length < 2) return 'Visningsnavn skal være mindst 2 tegn.';
    if (!email.trim()) return 'Angiv venligst en e-mailadresse.';
    if (!password) return 'Angiv venligst en adgangskode.';
    if (password.length < 6) return 'Adgangskoden skal være mindst 6 tegn.';
    return '';
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLocalError('');
    const cred = await login(email, password);
    if (!cred) return; // fejl vises via error fra hook

    // Navigation sker via useEffect når user/status ændres
  }

  async function handleSignup(e) {
    e.preventDefault();
    setLocalError('');
    const valErr = validateSignup();
    if (valErr) { setLocalError(valErr); return; }

    const firebaseUser = await signup(email, password, displayName);
    if (!firebaseUser) return; // fejl vises via error fra hook

    // Altid til /afventer efter oprettelse (status er pending)
    navigate('/afventer', { replace: true });
  }

  async function handleGoogleLogin() {
    setLocalError('');
    // Navigation sker via useEffect når user/status ændres (pending → /afventer).
    await signInWithGoogle();
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setLocalError('');
    setSuccessMsg('');
    if (!email.trim()) {
      setLocalError('Angiv din e-mailadresse for at nulstille adgangskoden.');
      return;
    }
    const ok = await resetPassword(email);
    if (ok) {
      setResetSent(true);
      setSuccessMsg('E-mail til nulstilling af adgangskode er sendt. Tjek din indbakke.');
    }
  }

  // Kombinerer fejl fra hook og lokal validering
  const displayError = localError || error;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '2rem 1rem' }}>
      <div className="card" style={{ width: '100%', maxWidth: 440, marginTop: '2rem' }}>
        {/* Logo / overskrift — neutral på den samlede platform, Tour-branding i enkelt-spil */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.25rem' }}>{PLATFORM_MODE ? '🏆' : '🚴'}</div>
          <h1 style={{ margin: 0, color: 'var(--c-pitch)', fontSize: '1.5rem' }}>
            {PLATFORM_MODE ? 'Vejleaa Tip' : 'Tour de France Tip'}
          </h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--c-muted)', fontSize: '0.875rem' }}>
            {PLATFORM_MODE ? 'Én konto — alle dine tipspil' : 'Danmarks bedste cykel-tippekonkurrence'}
          </p>
        </div>

        {/* Fane-vælger */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--c-border)', marginBottom: '1.5rem' }}>
          {[
            { key: TAB_LOGIN,  label: 'Log ind' },
            { key: TAB_SIGNUP, label: 'Opret bruger' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => switchTab(key)}
              style={{
                flex: 1,
                padding: '0.6rem',
                background: 'transparent',
                border: 'none',
                borderBottom: tab === key ? '2px solid var(--c-pitch)' : '2px solid transparent',
                color: tab === key ? 'var(--c-pitch)' : 'var(--c-muted)',
                fontWeight: tab === key ? 700 : 500,
                cursor: 'pointer',
                fontSize: '0.95rem',
                transition: 'color 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Log ind med Google — vises på begge faner */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.6rem',
            padding: '0.7rem',
            background: 'var(--c-bg)',
            border: '1px solid var(--c-border)',
            borderRadius: 8,
            color: 'var(--c-text)',
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            marginBottom: '1.25rem',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              fontWeight: 700,
              fontSize: '1.05rem',
              color: '#4285F4',
              fontFamily: 'Arial, sans-serif',
            }}
          >
            G
          </span>
          Log ind med Google
        </button>

        {/* "eller"-skillelinje mellem Google og e-mail-login */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '1.25rem',
            color: 'var(--c-muted)',
            fontSize: '0.8rem',
          }}
        >
          <span style={{ flex: 1, height: 1, background: 'var(--c-border)' }} />
          eller
          <span style={{ flex: 1, height: 1, background: 'var(--c-border)' }} />
        </div>

        {/* Fejlbesked */}
        {displayError && (
          <div
            role="alert"
            style={{
              background: '#fef2f2',
              border: '1px solid var(--c-err)',
              borderRadius: 8,
              padding: '0.6rem 0.8rem',
              color: 'var(--c-err)',
              fontSize: '0.875rem',
              marginBottom: '1rem',
            }}
          >
            {displayError}
          </div>
        )}

        {/* Succesbesked */}
        {successMsg && (
          <div
            style={{
              background: '#f0fdf4',
              border: '1px solid var(--c-ok)',
              borderRadius: 8,
              padding: '0.6rem 0.8rem',
              color: 'var(--c-ok)',
              fontSize: '0.875rem',
              marginBottom: '1rem',
            }}
          >
            {successMsg}
          </div>
        )}

        {/* === LOG IND === */}
        {tab === TAB_LOGIN && (
          <>
            {!showReset ? (
              <form onSubmit={handleLogin} noValidate>
                <FormGroup label="E-mail" htmlFor="login-email">
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="din@email.dk"
                    autoComplete="email"
                    required
                    style={inputStyle}
                  />
                </FormGroup>

                <FormGroup label="Adgangskode" htmlFor="login-pw" style={{ marginTop: '1rem' }}>
                  <input
                    id="login-pw"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    style={inputStyle}
                  />
                </FormGroup>

                <button
                  type="submit"
                  className="btn"
                  disabled={loading}
                  style={{ width: '100%', marginTop: '1.25rem', padding: '0.75rem' }}
                >
                  {loading ? 'Logger ind…' : 'Log ind'}
                </button>

                <button
                  type="button"
                  onClick={() => { setShowReset(true); clearError(); setLocalError(''); }}
                  style={{
                    display: 'block',
                    margin: '0.75rem auto 0',
                    background: 'none',
                    border: 'none',
                    color: 'var(--c-pitch)',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Glemt adgangskode?
                </button>
              </form>
            ) : (
              /* Glemt adgangskode */
              <form onSubmit={handleResetPassword} noValidate>
                <p style={{ fontSize: '0.9rem', color: 'var(--c-muted)', marginTop: 0 }}>
                  Indtast din e-mail, og vi sender dig et link til at nulstille adgangskoden.
                </p>
                <FormGroup label="E-mail" htmlFor="reset-email">
                  <input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="din@email.dk"
                    autoComplete="email"
                    required
                    style={inputStyle}
                  />
                </FormGroup>

                <button
                  type="submit"
                  className="btn"
                  disabled={loading || resetSent}
                  style={{ width: '100%', marginTop: '1.25rem', padding: '0.75rem' }}
                >
                  {loading ? 'Sender…' : 'Send nulstillingslink'}
                </button>

                <button
                  type="button"
                  onClick={() => { setShowReset(false); clearError(); setLocalError(''); setSuccessMsg(''); }}
                  style={{
                    display: 'block',
                    margin: '0.75rem auto 0',
                    background: 'none',
                    border: 'none',
                    color: 'var(--c-muted)',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Tilbage til login
                </button>
              </form>
            )}
          </>
        )}

        {/* === OPRET BRUGER === */}
        {tab === TAB_SIGNUP && (
          <form onSubmit={handleSignup} noValidate>
            <FormGroup label="Visningsnavn" htmlFor="signup-name">
              <input
                id="signup-name"
                type="text"
                value={displayName}
                onChange={e => setDName(e.target.value)}
                placeholder="Dit navn i konkurrencen"
                autoComplete="nickname"
                required
                style={inputStyle}
              />
            </FormGroup>

            <FormGroup label="E-mail" htmlFor="signup-email" style={{ marginTop: '1rem' }}>
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="din@email.dk"
                autoComplete="email"
                required
                style={inputStyle}
              />
            </FormGroup>

            <FormGroup label="Adgangskode" htmlFor="signup-pw" style={{ marginTop: '1rem' }}>
              <input
                id="signup-pw"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mindst 6 tegn"
                autoComplete="new-password"
                required
                style={inputStyle}
              />
            </FormGroup>

            <button
              type="submit"
              className="btn"
              disabled={loading}
              style={{ width: '100%', marginTop: '1.25rem', padding: '0.75rem' }}
            >
              {loading ? 'Opretter…' : 'Opret bruger'}
            </button>

            <p style={{ fontSize: '0.8rem', color: 'var(--c-muted)', textAlign: 'center', marginTop: '0.75rem' }}>
              Din konto godkendes af en administrator, inden du kan deltage.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

// Lille hjælpekomponent for formular-grupper
function FormGroup({ label, htmlFor, children, style }) {
  return (
    <div style={style}>
      <label
        htmlFor={htmlFor}
        style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.35rem' }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

// Fælles input-stil
const inputStyle = {
  width: '100%',
  padding: '0.6rem 0.75rem',
  border: '1px solid var(--c-border)',
  borderRadius: 8,
  fontSize: '1rem',
  background: 'var(--c-bg)',
  color: 'var(--c-text)',
  outline: 'none',
};
