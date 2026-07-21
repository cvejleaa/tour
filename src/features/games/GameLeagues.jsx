/**
 * GameLeagues — private mini-ligaer i ét spil: se dine ligaer + deres interne
 * stilling, opret en ny liga (få en delbar kode), og deltag med en kode.
 */
import { useMemo, useState } from 'react';
import Avatar from '../../components/Avatar';
import { useAuth } from '../../context/AuthContext';
import { useGameLeagues } from './useGameLeagues';
import { useGameStandings } from './useGameStandings';
import { subsetRanking } from './gameStandings';
import { formatPoints } from './GameLayout';
import { createLeague, joinLeagueByCode, leaveLeague } from './gameLeagueActions';

function LeagueTable({ rows, meUid }) {
  if (rows.length === 0) {
    return <p style={{ color: 'var(--c-muted)', margin: '0.5rem 0' }}>Ingen medlemmer med point endnu.</p>;
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
      <tbody>
        {rows.map((r) => (
          <tr key={r.uid} style={{ borderTop: '1px solid var(--c-border, #eee)', fontWeight: r.uid === meUid ? 700 : 400 }}>
            <td style={{ padding: '0.35rem 0.4rem', width: 32, fontVariantNumeric: 'tabular-nums' }}>{r.rank}</td>
            <td style={{ padding: '0.35rem 0.4rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <Avatar uid={r.uid} name={r.name} emoji={r.emoji} favoriteTeam={r.favoriteTeam} size={22} />
                {r.name}{r.uid === meUid && <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}> (dig)</span>}
              </span>
            </td>
            <td style={{ padding: '0.35rem 0.4rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatPoints(r.totalPoints)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LeagueCard({ league, standings, meUid, gameId, onLeave }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => subsetRanking(standings, league.memberUids), [standings, league.memberUids]);
  const isOwner = league.ownerUid === meUid;

  async function handleLeave() {
    if (!window.confirm(`Forlad "${league.name}"?`)) return;
    setBusy(true);
    await leaveLeague({ uid: meUid, gameId, leagueId: league.id });
    setBusy(false);
    onLeave?.();
  }

  return (
    <div className="card mb-2">
      <div className="flex items-center justify-between" style={{ gap: '0.5rem' }}>
        <span style={{ fontWeight: 600 }}>
          {league.name}
          <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}> · {league.memberUids?.length ?? 0} medlemmer</span>
        </span>
        <button className="btn btn--ghost btn--sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Skjul' : 'Stilling'}
        </button>
      </div>

      {open && (
        <>
          <LeagueTable rows={rows} meUid={meUid} />
          <div className="flex items-center justify-between" style={{ gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--c-muted)' }}>
              Invitationskode: <strong style={{ letterSpacing: '1px', color: 'var(--c-text, inherit)' }}>{league.code}</strong>
              {isOwner && ' (del den med vennerne)'}
            </span>
            <button className="btn btn--ghost btn--sm" disabled={busy} onClick={handleLeave}>Forlad</button>
          </div>
        </>
      )}
    </div>
  );
}

export default function GameLeagues({ gameId }) {
  const { user } = useAuth();
  const meUid = user?.uid;
  const { leagues, loading, error } = useGameLeagues(gameId);
  const { standings } = useGameStandings(gameId);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleCreate(e) {
    e.preventDefault();
    setMsg(''); setErr(''); setBusy(true);
    const res = await createLeague({ uid: meUid, gameId, name });
    if (res.ok) { setMsg(`Ligaen "${name.trim()}" er oprettet! Del koden ${res.code} med dine venner.`); setName(''); }
    else setErr(res.error);
    setBusy(false);
  }

  async function handleJoin(e) {
    e.preventDefault();
    setMsg(''); setErr(''); setBusy(true);
    const res = await joinLeagueByCode({ gameId, code });
    if (res.ok) { setMsg(res.already ? `Du er allerede med i "${res.name}".` : `Du er nu med i "${res.name}"!`); setCode(''); }
    else setErr(res.error);
    setBusy(false);
  }

  return (
    <div>
      {msg && <p className="badge mb-2" style={{ display: 'block' }}>{msg}</p>}
      {err && <p className="badge badge--red mb-2">{err}</p>}

      {/* Mine ligaer */}
      {loading ? (
        <div className="spinner" role="status" aria-label="Indlæser" />
      ) : error ? (
        <p className="badge badge--red">{error}</p>
      ) : leagues.length === 0 ? (
        <div className="empty-state" style={{ paddingBottom: '0.5rem' }}>
          <div className="empty-state__icon">👥</div>
          <div className="empty-state__title">Du er ikke med i nogen ligaer endnu.</div>
          <p style={{ color: 'var(--c-muted)' }}>Opret en liga og inviter dine venner, eller deltag med en kode.</p>
        </div>
      ) : (
        leagues.map((l) => (
          <LeagueCard key={l.id} league={l} standings={standings} meUid={meUid} gameId={gameId} />
        ))
      )}

      {/* Opret + deltag */}
      <div className="grid-2" style={{ gap: '0.75rem', marginTop: '0.5rem' }}>
        <form className="card" onSubmit={handleCreate}>
          <h3 className="card__title">Opret liga</h3>
          <input
            type="text" value={name} maxLength={40} placeholder="Ligaens navn"
            onChange={(e) => setName(e.target.value)}
            style={{ width: '100%', marginBottom: '0.5rem' }}
          />
          <button className="btn btn--sm" disabled={busy || name.trim().length < 2} type="submit">Opret</button>
        </form>

        <form className="card" onSubmit={handleJoin}>
          <h3 className="card__title">Deltag med kode</h3>
          <input
            type="text" value={code} maxLength={8} placeholder="F.eks. X4KR2M"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            style={{ width: '100%', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '1px' }}
          />
          <button className="btn btn--sm" disabled={busy || code.trim().length < 4} type="submit">Deltag</button>
        </form>
      </div>
    </div>
  );
}
