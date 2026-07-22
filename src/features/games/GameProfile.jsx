/**
 * GameProfile — din profil I DETTE spil. Pt. dit yndlingshold, som er
 * spil-specifikt (holdene er forskellige fra spil til spil). Vælget gemmes på
 * games/{gameId}/players/{uid}.favoriteTeam og giver din avatar holdets farve/
 * badge i spillets stilling og ligaer.
 */
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../../components/Avatar';
import ClubBadge from '../../components/ClubBadge';
import { setPlayerFavoriteTeam } from './gameActions';
import { SUPERLIGA_TEAMS_2026 } from '../../data/superligaTeams2026';

export default function GameProfile({ game, me }) {
  const gameId = game?.id;
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  // Spillets hold (fra spil-dokumentet), ellers Superliga-holdene som fallback.
  const teams = useMemo(() => {
    const t = Array.isArray(game?.teams) && game.teams.length ? game.teams : SUPERLIGA_TEAMS_2026;
    return [...t].sort((a, b) => a.name.localeCompare(b.name, 'da'));
  }, [game]);

  const [team, setTeam] = useState(me?.favoriteTeam ?? '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // 'saved' | string | null

  useEffect(() => { setTeam(me?.favoriteTeam ?? ''); }, [me?.favoriteTeam]);

  const chosen = teams.find((t) => t.name === team) || null;

  async function save() {
    setBusy(true); setStatus(null);
    const res = await setPlayerFavoriteTeam(uid, gameId, team);
    setStatus(res.ok ? 'saved' : (res.error || 'error'));
    setBusy(false);
  }

  return (
    <div className="card">
      <h3 className="card__title" style={{ marginTop: 0 }}>🙂 Din profil i {game?.name || 'spillet'}</h3>
      <p style={{ color: 'var(--c-muted)', marginTop: 0 }}>
        Vælg dit <strong>yndlingshold</strong> i dette spil. Det giver din avatar holdets farve i stillingen
        og i dine ligaer. Holdet gælder kun her — andre spil har deres egne hold.
      </p>

      <div className="flex items-center" style={{ gap: '0.75rem', margin: '0.5rem 0 1rem' }}>
        <Avatar uid={uid} name={me?.displayName} emoji={me?.avatarEmoji} favoriteTeam={team || null} size={48} />
        <div>
          <div style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            {chosen && <ClubBadge code={chosen.short} color={chosen.color} size={22} title={chosen.name} />}
            {chosen ? chosen.name : 'Intet hold valgt'}
          </div>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="game-fav-team">Yndlingshold</label>
        <select
          id="game-fav-team" className="select" value={team}
          onChange={(e) => { setTeam(e.target.value); setStatus(null); }}
          style={{ maxWidth: 280 }}
        >
          <option value="">– Intet valgt –</option>
          {teams.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
      </div>

      <div className="flex items-center" style={{ gap: '0.6rem', marginTop: '0.5rem' }}>
        <button className="btn btn--sm" onClick={save} disabled={busy}>{busy ? 'Gemmer…' : 'Gem'}</button>
        {status === 'saved' && <span className="badge badge--green">Gemt ✓</span>}
        {status && status !== 'saved' && <span className="badge badge--red">{status === 'error' ? 'Kunne ikke gemme.' : status}</span>}
      </div>
    </div>
  );
}
