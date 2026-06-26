// Afventeside — vises til brugere der ikke er godkendt endnu.
// Håndterer status: pending og rejected. Redirecter til "/" hvis godkendt.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { USER_STATUS } from '../lib/constants';
import { redeemInviteCode } from '../features/auth/inviteActions';

export default function PendingPage() {
  const { user, status, loading } = useAuth();
  const navigate = useNavigate();

  // Selvbetjent godkendelse via invitationskode
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState('');
  const [redeemOk, setRedeemOk] = useState('');

  async function handleRedeem(e) {
    e.preventDefault();
    setRedeemError('');
    setRedeemOk('');
    setRedeeming(true);
    try {
      const { leagueName } = await redeemInviteCode(code);
      setRedeemOk(`Godkendt! Du er tilmeldt "${leagueName}". Sender dig videre…`);
      // Statusskiftet (pending→approved) opdaterer automatisk via AuthContext,
      // men vi navigerer også eksplicit for en hurtig oplevelse.
      setTimeout(() => navigate('/', { replace: true }), 1200);
    } catch (err) {
      setRedeemError(err?.message || 'Kunne ikke indløse koden. Prøv igen.');
    } finally {
      setRedeeming(false);
    }
  }

  // Redirect til forsiden hvis brugeren allerede er godkendt
  useEffect(() => {
    if (!loading && user && status === USER_STATUS.APPROVED) {
      navigate('/', { replace: true });
    }
    // Ikke logget ind: lad ProtectedRoute håndtere det
    if (!loading && !user) {
      navigate('/login', { replace: true });
    }
  }, [loading, user, status, navigate]);

  async function handleLogout() {
    await signOut(auth);
    navigate('/login', { replace: true });
  }

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', paddingTop: '3rem' }}>
        <p style={{ color: 'var(--c-muted)' }}>Indlæser…</p>
      </div>
    );
  }

  // Status: afvist
  if (status === USER_STATUS.REJECTED) {
    return (
      <div
        className="container"
        style={{ display: 'flex', justifyContent: 'center', paddingTop: '3rem' }}
      >
        <div
          className="card"
          style={{ maxWidth: 480, width: '100%', textAlign: 'center', padding: '2rem' }}
        >
          {/* Ikon */}
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚫</div>

          <h1
            style={{
              margin: '0 0 0.5rem',
              color: 'var(--c-err)',
              fontSize: '1.4rem',
            }}
          >
            Adgang afvist
          </h1>

          <p style={{ color: 'var(--c-muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
            Din adgang til Tour de France Tip er desværre blevet afvist af en administrator.
            Hvis du mener, det er en fejl, bedes du kontakte turneringsarrangøren.
          </p>

          <div
            style={{
              background: '#fef2f2',
              border: '1px solid var(--c-err)',
              borderRadius: 10,
              padding: '0.75rem 1rem',
              marginBottom: '1.5rem',
              fontSize: '0.875rem',
              color: 'var(--c-err)',
            }}
          >
            Din konto er markeret som <strong>afvist</strong>.
          </div>

          <button
            className="btn btn--ghost"
            onClick={handleLogout}
            style={{ width: '100%' }}
          >
            Log ud
          </button>
        </div>
      </div>
    );
  }

  // Status: pending (standard)
  return (
    <div
      className="container"
      style={{ display: 'flex', justifyContent: 'center', paddingTop: '3rem' }}
    >
      <div
        className="card"
        style={{ maxWidth: 480, width: '100%', textAlign: 'center', padding: '2rem' }}
      >
        {/* Ikon */}
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>

        <h1
          style={{
            margin: '0 0 0.5rem',
            color: 'var(--c-pitch)',
            fontSize: '1.4rem',
          }}
        >
          Afventer godkendelse
        </h1>

        <p style={{ color: 'var(--c-muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          Din konto er oprettet, men du mangler at blive godkendt af en administrator,
          inden du kan deltage i Tour de France Tip.
        </p>

        <div
          style={{
            background: '#fffbeb',
            border: '1px solid var(--c-warn)',
            borderRadius: 10,
            padding: '0.75rem 1rem',
            marginBottom: '1.5rem',
            fontSize: '0.875rem',
            color: '#92600a',
          }}
        >
          <strong>Hvad sker der nu?</strong>
          <ul
            style={{
              margin: '0.5rem 0 0',
              paddingLeft: '1.25rem',
              textAlign: 'left',
              lineHeight: 1.7,
            }}
          >
            <li>Administratoren modtager en notifikation om din tilmelding.</li>
            <li>Når din konto er godkendt, kan du logge ind og begynde at tippe.</li>
            <li>Du kan prøve at logge ind igen om lidt — siden opdaterer automatisk.</li>
          </ul>
        </div>

        {/* Selvbetjening: indløs invitationskode for at få adgang med det samme */}
        <form onSubmit={handleRedeem} style={{ marginBottom: '1.25rem', textAlign: 'left' }}>
          <label htmlFor="invite-code" style={{ fontWeight: 600, fontSize: '0.9rem' }}>
            Har du en invitationskode?
          </label>
          <p style={{ color: 'var(--c-muted)', fontSize: '0.82rem', margin: '0.25rem 0 0.6rem' }}>
            Indtast koden fra din liga for at blive godkendt og tilmeldt med det samme.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              id="invite-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="fx ABC123"
              autoCapitalize="characters"
              disabled={redeeming || !!redeemOk}
              style={{
                flex: 1, padding: '0.5rem 0.75rem', borderRadius: 8,
                border: '1px solid var(--c-border)', textTransform: 'uppercase',
                fontSize: '1rem', letterSpacing: '0.1em',
              }}
            />
            <button
              className="btn"
              type="submit"
              disabled={redeeming || !code.trim() || !!redeemOk}
            >
              {redeeming ? '…' : 'Indløs'}
            </button>
          </div>
          {redeemError && (
            <div style={{ color: 'var(--c-err)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              {redeemError}
            </div>
          )}
          {redeemOk && (
            <div style={{ color: 'var(--c-ok)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              {redeemOk}
            </div>
          )}
        </form>

        <button
          className="btn btn--ghost"
          onClick={handleLogout}
          style={{ width: '100%' }}
        >
          Log ud
        </button>
      </div>
    </div>
  );
}
