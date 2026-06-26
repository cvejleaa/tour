// Admin-fane: godkend/afvis ligaer og tilmeld medlemmer.
import { useState } from 'react';
import { useAllLeagues } from '../leagues/useAllLeagues';
import { useUsers } from './useUsers';
import { setLeagueStatus, adminAddMember, removeMember, renameLeague, setLeagueAdmin } from '../leagues/leagueActions';
import { LEAGUE_STATUS, USER_STATUS } from '../../lib/constants';
import { useAuth } from '../../context/AuthContext';

const STATUS_BADGE = {
  [LEAGUE_STATUS.PENDING]:  { cls: 'badge--yellow', label: 'Afventer' },
  [LEAGUE_STATUS.APPROVED]: { cls: 'badge--green',  label: 'Godkendt' },
  [LEAGUE_STATUS.REJECTED]: { cls: 'badge--red',    label: 'Afvist' },
};

export default function LeaguesAdminTab() {
  const { leagues, loading, error } = useAllLeagues();
  const { users } = useUsers();
  const { isOwner } = useAuth(); // kun den globale ejer kan tildele liga-admins
  const [busy, setBusy] = useState('');
  const [pick, setPick] = useState({}); // { [leagueId]: uid }
  const [editing, setEditing] = useState({}); // { [leagueId]: nyt navn (string) }

  const nameOf = (uid) => {
    const u = users.find((x) => x.id === uid);
    return u?.displayName || u?.email || uid;
  };
  // Spillere der kan tilføjes: alle der ikke er afvist (også 'afventer' kan tilføjes)
  const addableUsers = users.filter((u) => u.status !== USER_STATUS.REJECTED);

  async function run(key, fn) {
    setBusy(key);
    try { await fn(); }
    catch (e) { console.error(e); alert('Fejl: ' + (e.message ?? 'ukendt')); }
    finally { setBusy(''); }
  }

  if (loading) return <p style={{ color: 'var(--c-muted)' }}>Henter ligaer…</p>;
  if (error) return <p role="alert" style={{ color: 'var(--c-err)' }}>{error}</p>;
  if (leagues.length === 0) return <p style={{ color: 'var(--c-muted)' }}>Ingen ligaer oprettet endnu.</p>;

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {leagues.map((lg) => {
        const status = lg.status ?? LEAGUE_STATUS.PENDING;
        const badge = STATUS_BADGE[status] ?? STATUS_BADGE.pending;
        const members = lg.memberUids ?? [];
        const admins = lg.adminUids ?? [];
        const candidates = addableUsers.filter((u) => !members.includes(u.id));
        return (
          <li key={lg.id} style={{ padding: '0.85rem 0', borderBottom: '1px solid var(--c-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {editing[lg.id] !== undefined ? (
                <span style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    className="input"
                    style={{ maxWidth: 220 }}
                    value={editing[lg.id]}
                    maxLength={40}
                    aria-label="Nyt liganavn"
                    data-testid={`rename-input-${lg.id}`}
                    onChange={(e) => setEditing((s) => ({ ...s, [lg.id]: e.target.value }))}
                  />
                  <button
                    className="btn btn--sm"
                    disabled={busy === lg.id || !editing[lg.id]?.trim()}
                    onClick={() => run(lg.id, async () => {
                      await renameLeague(lg.id, editing[lg.id]);
                      setEditing((s) => { const n = { ...s }; delete n[lg.id]; return n; });
                    })}
                  >
                    Gem
                  </button>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => setEditing((s) => { const n = { ...s }; delete n[lg.id]; return n; })}
                  >
                    Annullér
                  </button>
                </span>
              ) : (
                <>
                  <strong style={{ fontSize: '1rem' }}>{lg.name}</strong>
                  <button
                    className="btn--icon"
                    title="Omdøb liga"
                    aria-label={`Omdøb ${lg.name}`}
                    data-testid={`rename-btn-${lg.id}`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    onClick={() => setEditing((s) => ({ ...s, [lg.id]: lg.name }))}
                  >
                    ✏️
                  </button>
                </>
              )}
              <span className={`badge ${badge.cls}`}>{badge.label}</span>
              <span className="badge badge--muted">{members.length} medlem{members.length === 1 ? '' : 'mer'}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>
                Ejer: {nameOf(lg.ownerUid)} · Kode: <strong>{lg.joinCode}</strong>
              </span>
            </div>

            {/* Godkend / afvis */}
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {status !== LEAGUE_STATUS.APPROVED && (
                <button className="btn btn--sm" disabled={busy === lg.id}
                  onClick={() => run(lg.id, () => setLeagueStatus(lg.id, LEAGUE_STATUS.APPROVED))}>
                  ✓ Godkend
                </button>
              )}
              {status !== LEAGUE_STATUS.REJECTED && (
                <button className="btn btn--ghost btn--sm" disabled={busy === lg.id}
                  onClick={() => run(lg.id, () => setLeagueStatus(lg.id, LEAGUE_STATUS.REJECTED))}>
                  Afvis
                </button>
              )}
            </div>

            {/* Tilmeld medlem */}
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {candidates.length === 0 ? (
                <span style={{ fontSize: '0.82rem', color: 'var(--c-muted)' }}>
                  Ingen spillere at tilføje{users.length === 0 ? ' (ingen brugere endnu)' : ' – alle er allerede medlem'}.
                </span>
              ) : (
                <>
                  <select
                    className="select"
                    style={{ maxWidth: 240 }}
                    value={pick[lg.id] ?? ''}
                    onChange={(e) => setPick((p) => ({ ...p, [lg.id]: e.target.value }))}
                    data-testid={`add-member-select-${lg.id}`}
                  >
                    <option value="">– Vælg spiller –</option>
                    {candidates.map((u) => (
                      <option key={u.id} value={u.id}>
                        {(u.displayName || u.email)}{u.status !== USER_STATUS.APPROVED ? ' (afventer)' : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn--sm"
                    disabled={!pick[lg.id] || busy === lg.id}
                    onClick={() => run(lg.id, async () => {
                      await adminAddMember(lg.id, pick[lg.id]);
                      setPick((p) => ({ ...p, [lg.id]: '' }));
                    })}
                  >
                    Tilmeld medlem
                  </button>
                </>
              )}
            </div>

            {/* Medlemsliste med liga-admin-styring */}
            {members.length > 0 && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {members.map((uid) => {
                  const isLeagueAdmin = admins.includes(uid);
                  return (
                    <span key={uid} className={`badge ${isLeagueAdmin ? 'badge--blue' : 'badge--muted'}`} style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                      {nameOf(uid)}
                      {uid === lg.ownerUid ? ' (ejer)' : isLeagueAdmin ? ' (liga-admin)' : ''}
                      {/* Kun den globale ejer kan tildele/fjerne liga-admin (ikke for liga-ejeren selv) */}
                      {isOwner && uid !== lg.ownerUid && (
                        <button
                          className="btn--icon"
                          title={isLeagueAdmin ? 'Fjern som liga-admin' : 'Gør til liga-admin'}
                          aria-label={isLeagueAdmin ? `Fjern ${nameOf(uid)} som liga-admin` : `Gør ${nameOf(uid)} til liga-admin`}
                          data-testid={`toggle-league-admin-${lg.id}-${uid}`}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          disabled={busy === lg.id}
                          onClick={() => run(lg.id, () => setLeagueAdmin(lg.id, uid, !isLeagueAdmin))}
                        >
                          {isLeagueAdmin ? '★' : '☆'}
                        </button>
                      )}
                      {uid !== lg.ownerUid && (
                        <button
                          className="btn--icon"
                          title="Fjern medlem"
                          style={{ background: 'none', border: 'none', color: 'var(--c-err)', cursor: 'pointer', padding: 0 }}
                          disabled={busy === lg.id}
                          onClick={() => run(lg.id, () => removeMember(lg.id, uid, lg.ownerUid))}
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
