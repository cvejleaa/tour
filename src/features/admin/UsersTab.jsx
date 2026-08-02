// Brugerfanen i admin-panelet — tilgængelig for globale admins.
// Globale admins kan godkende/afvise brugere; KUN ejeren kan udpege/fjerne
// globale admins (rolletildeling) og slette brugere.
import { useEffect, useMemo, useState } from 'react';
import { useUsers } from './useUsers';
import UserRow from './UserRow';
import { approveUsers, callAuthUserInfo } from './adminActions';
import { USER_STATUS } from '../../lib/constants';

/**
 * @param {{ isOwner: boolean, isGlobalAdmin: boolean }} props
 */
export default function UsersTab({ isOwner, isGlobalAdmin }) {
  const { users, loading, error } = useUsers();
  const [providers, setProviders] = useState({}); // uid → { providers, lastSignIn, creation }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  // Hent login-metode (Google vs e-mail) for alle konti, så to konti med samme
  // e-mail kan skelnes. Kræver adminAuthUserInfo (functions-platform).
  useEffect(() => {
    let alive = true;
    callAuthUserInfo().then((res) => {
      if (!alive || !res.ok) return;
      const m = {};
      for (const u of res.users) m[u.uid] = u;
      setProviders(m);
    });
    return () => { alive = false; };
  }, []);

  const statusOrder = {
    [USER_STATUS.PENDING]: 0,
    [USER_STATUS.APPROVED]: 1,
    [USER_STATUS.REJECTED]: 2,
  };
  const sorted = useMemo(
    () => [...users].sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)),
    [users], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // "Afventer" = ikke godkendt og ikke afvist (dækker også importerede brugere
  // helt uden status-felt, fx fra VM-migreringen).
  const toApprove = useMemo(
    () => sorted.filter((u) => u.status !== USER_STATUS.APPROVED && u.status !== USER_STATUS.REJECTED),
    [sorted],
  );

  async function approveAll() {
    if (!window.confirm(`Godkend ${toApprove.length} bruger${toApprove.length === 1 ? '' : 'e'} på én gang? (De får ingen besked.)`)) return;
    setBusy(true); setMsg(null);
    const res = await approveUsers(toApprove.map((u) => u.id));
    setMsg(res.ok
      ? { kind: 'ok', text: `${res.count} bruger${res.count === 1 ? '' : 'e'} godkendt.` }
      : { kind: 'err', text: res.error });
    setBusy(false);
  }

  if (!isGlobalAdmin) return null;
  if (loading) return <p style={{ color: 'var(--c-muted)' }}>Henter brugere…</p>;
  if (error) return <p role="alert" style={{ color: 'var(--c-err)' }}>{error}</p>;

  return (
    <div>
      {toApprove.length > 0 && (
        <div style={{
          background: 'color-mix(in srgb, var(--c-warn) 10%, var(--c-surface))',
          border: '1px solid var(--c-warn)', borderRadius: 10, padding: '0.6rem 1rem',
          marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '0.75rem', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--c-warn)' }}>
            {toApprove.length} bruger{toApprove.length === 1 ? '' : 'e'} afventer godkendelse.
          </span>
          <button className="btn btn--sm" disabled={busy} onClick={approveAll}>
            {busy ? 'Godkender…' : `✅ Godkend alle (${toApprove.length})`}
          </button>
        </div>
      )}

      {msg && (
        <p className={`badge ${msg.kind === 'ok' ? 'badge--green' : 'badge--red'} mb-2`} style={{ display: 'block' }}>
          {msg.text}
        </p>
      )}

      {users.length === 0 ? (
        <p style={{ color: 'var(--c-muted)' }}>Ingen brugere registreret endnu.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {sorted.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              authInfo={providers[u.id]}
              currentUserIsOwner={isOwner}
              currentUserCanApprove={isGlobalAdmin}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
