// ---------------------------------------------------------------------------
// JoinPage ("/tilmeld?kode=ABC123") — landingsside for liga-invitationslinks.
// Ruter modtageren rigtigt efter login-tilstand:
//   - Ikke logget ind → gem koden + venlig invitation til at oprette bruger.
//   - Afventende bruger → gem koden + videre til /afventer (auto-indløses dér).
//   - Godkendt bruger → tilmeld direkte til ligaen her på siden.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { USER_STATUS } from '../lib/constants';
import { joinLeague } from '../features/leagues/leagueActions';
import { joinLeagueByCode } from '../features/games/gameLeagueActions';
import { tryLogActivity, ACTIVITY } from '../features/leagues/activityActions';
import {
  setPendingJoinCode, getPendingJoinCode, getPendingJoinGameId, clearPendingJoinCode,
} from '../features/leagues/joinLink';
import { PLATFORM_MODE } from '../lib/platform';

export default function JoinPage() {
  const { user, status, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Kode fra linket; fald tilbage til en tidligere gemt (fx efter login-runde).
  const code = (params.get('kode') || params.get('code') || '').trim().toUpperCase()
    || getPendingJoinCode();
  // Spil-id (kun platform-ligaer): fra linket eller en tidligere gemt runde.
  const gameId = (params.get('spil') || params.get('game') || '').trim()
    || getPendingJoinGameId();

  const [state, setState] = useState({ phase: 'working', msg: '' }); // working|ok|error|invite
  const attempted = useRef(false);

  // Gem kode (+ spil-id) med det samme, så det overlever login/oprettelses-redirects.
  useEffect(() => {
    if (code) setPendingJoinCode(code, gameId);
  }, [code, gameId]);

  useEffect(() => {
    if (loading) return;
    if (!code) { setState({ phase: 'error', msg: 'Linket mangler en invitationskode.' }); return; }

    // Ikke logget ind: forklar hvad der sker, og send videre til login/oprettelse.
    if (!user) { setState({ phase: 'invite', msg: '' }); return; }

    if (attempted.current) return;

    // ── Platform: spil-liga via kode (auto-godkender + tilmelder spil + liga). ──
    if (PLATFORM_MODE) {
      if (!gameId) { setState({ phase: 'error', msg: 'Linket mangler et spil. Bed afsenderen om et nyt link.' }); return; }
      attempted.current = true;
      (async () => {
        const res = await joinLeagueByCode({ gameId, code });
        if (res.ok) {
          clearPendingJoinCode();
          setState({ phase: 'ok', msg: res.already ? `Du er allerede med i "${res.name}". 🎉` : `Du er nu med i "${res.name}"! 🎉` });
          setTimeout(() => navigate(`/spil/${gameId}`, { replace: true }), 1400);
        } else {
          setState({ phase: 'error', msg: res.error || 'Kunne ikke tilmelde dig ligaen.' });
        }
      })();
      return;
    }

    // ── Tour: top-niveau-liga. Afventende bruger indløses på afventer-siden. ──
    if (status !== USER_STATUS.APPROVED) { navigate('/afventer', { replace: true }); return; }

    // Godkendt bruger: tilmeld direkte — men kun ét forsøg (StrictMode/dobbelt-render).
    attempted.current = true;
    (async () => {
      try {
        const { id, name } = await joinLeague(code);
        tryLogActivity({
          leagueId: id, type: ACTIVITY.JOIN, actorUid: user.uid,
          actorName: profile?.displayName || 'Spiller', text: 'tilmeldte sig ligaen',
        });
        clearPendingJoinCode();
        setState({ phase: 'ok', msg: `Du er nu med i "${name}"! 🎉` });
      } catch (err) {
        // "Allerede medlem" er en helt fin slutning på et invitationslink.
        const already = /allerede medlem/i.test(err?.message || '');
        if (already) clearPendingJoinCode();
        setState({ phase: already ? 'ok' : 'error', msg: err?.message || 'Kunne ikke tilmelde dig ligaen.' });
      }
    })();
  }, [loading, user, status, code, gameId, navigate, profile?.displayName]);

  const box = { maxWidth: 460, margin: '3rem auto', textAlign: 'center' };

  if (loading || state.phase === 'working') {
    return (
      <div className="container" style={box}>
        <div className="card">
          <div style={{ fontSize: '2rem' }}>🚴</div>
          <p style={{ color: 'var(--c-muted)' }}>Et øjeblik — vi tilmelder dig ligaen…</p>
        </div>
      </div>
    );
  }

  if (state.phase === 'invite') {
    return (
      <div className="container" style={box}>
        <div className="card">
          <div style={{ fontSize: '2.2rem' }}>🎉</div>
          <h1 style={{ fontSize: '1.3rem', margin: '0.5rem 0' }}>Du er inviteret til en liga!</h1>
          <p style={{ color: 'var(--c-muted)', fontSize: '0.95rem', lineHeight: 1.6 }}>
            Opret en bruger (eller log ind), så bliver du automatisk godkendt og
            tilmeldt ligaen med koden <strong>{code}</strong> — du skal ikke taste den igen.
          </p>
          <Link to="/login" className="btn" style={{ marginTop: '0.5rem' }}>
            Opret bruger / log ind
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={box}>
      <div className="card">
        <div style={{ fontSize: '2.2rem' }}>{state.phase === 'ok' ? '✅' : '😕'}</div>
        <p style={{ fontWeight: 600 }}>{state.msg}</p>
        <Link to="/ligaer" className="btn" style={{ marginTop: '0.5rem' }}>
          Til mine ligaer
        </Link>
      </div>
    </div>
  );
}
