// Én række i brugerlisten i admin-panelet.
// Viser navn, e-mail, rolle, status og handlingsknapper.
import { useState } from 'react';
import { ROLES, USER_STATUS } from '../../lib/constants';
import { setUserStatus, setGlobalAdminRole, sendAdminPasswordReset, callDeleteUser, callSetUserEmail } from './adminActions';
import Avatar from '../../components/Avatar';
import { prettyTeam } from '../../data/tourTeams2026';
import { isJerseyToken, JERSEY_BY_TOKEN } from '../../data/jerseyAvatars';
import { PLATFORM_MODE } from '../../lib/platform';
import { auth } from '../../firebase';

// Vis login-metode, så to konti med samme e-mail kan skelnes (fx en Google- og
// en e-mail/kodeord-konto). authInfo kommer fra adminAuthUserInfo (kun platform).
// En række står ALDRIG tvetydigt tom: kan metoden ikke bestemmes (login-info
// ikke hentet, eller kontoen fandtes ikke i Auth-opslaget), vises "❔ Ukendt" —
// tom betyder altså IKKE Google.
function providerBadges(authInfo) {
  const provs = authInfo?.providers || [];
  const out = [];
  if (provs.includes('google.com')) out.push({ key: 'g', label: '🔵 Google' });
  if (provs.includes('password')) out.push({ key: 'p', label: '✉️ E-mail' });
  for (const p of provs) {
    if (p === 'google.com' || p === 'password') continue;
    out.push({ key: p, label: p });
  }
  if (out.length === 0) {
    out.push({ key: 'unknown', label: authInfo ? '❔ Ukendt' : '❔ Login ukendt' });
  }
  return out;
}

// Oversæt status til dansk
const statusLabel = {
  [USER_STATUS.PENDING]:  'Afventer',
  [USER_STATUS.APPROVED]: 'Godkendt',
  [USER_STATUS.REJECTED]: 'Afvist',
};

// Farve pr. status
const statusColor = {
  [USER_STATUS.PENDING]:  'var(--c-warn)',
  [USER_STATUS.APPROVED]: 'var(--c-ok)',
  [USER_STATUS.REJECTED]: 'var(--c-err)',
};

// Oversæt rolle til dansk
const roleLabel = {
  [ROLES.OWNER]:        'Ejer',
  [ROLES.GLOBAL_ADMIN]: 'Global admin',
  [ROLES.PLAYER]:       'Spiller',
};

/**
 * @param {{ user: object, authInfo?: object, currentUserIsOwner: boolean, currentUserCanApprove: boolean }} props
 */
export default function UserRow({ user, authInfo, currentUserIsOwner, currentUserCanApprove }) {
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [resetInfo, setResetInfo] = useState(null);

  const isOwner = user.role === ROLES.OWNER;
  // Kun kosmetisk: skjul slet-knappen på egen række (backend blokerer også
  // selv-sletning). Læses fra auth-singletonen, ikke useAuth, så UserRow kan
  // renderes uden AuthProvider (fx i tests).
  const isSelf = auth?.currentUser?.uid === user.id;
  const badges = providerBadges(authInfo);

  async function handlePasswordReset() {
    if (!window.confirm(`Send et nulstillingslink til ${user.displayName} (${user.email})?`)) return;
    setBusy(true);
    setLocalError('');
    setResetInfo(null);
    try {
      const res = await sendAdminPasswordReset(user.id);
      setResetInfo(res);
    } catch (err) {
      setLocalError('Fejl: ' + (err.message ?? 'Ukendt fejl'));
    } finally {
      setBusy(false);
    }
  }

  async function handleStatus(newStatus) {
    const label = newStatus === USER_STATUS.APPROVED ? 'godkende' : 'afvise';
    if (!window.confirm(`Er du sikker på, at du vil ${label} ${user.displayName}?`)) return;

    setBusy(true);
    setLocalError('');
    try {
      await setUserStatus(user.id, newStatus);
    } catch (err) {
      setLocalError('Fejl: ' + (err.message ?? 'Ukendt fejl'));
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleToggle() {
    const newRole =
      user.role === ROLES.GLOBAL_ADMIN ? 'spiller' : 'global admin';
    if (
      !window.confirm(
        `Skift ${user.displayName} til ${newRole}?`
      )
    )
      return;

    setBusy(true);
    setLocalError('');
    try {
      await setGlobalAdminRole(user.id, user.role);
    } catch (err) {
      setLocalError('Fejl: ' + (err.message ?? 'Ukendt fejl'));
    } finally {
      setBusy(false);
    }
  }

  async function handleChangeEmail() {
    const next = window.prompt(
      `Ny e-mail for ${user.displayName || user.email}?\n\n`
      + 'Skiftet gælder med det samme (login + påmindelser) — ingen bekræftelses-mail.',
      user.email || '',
    );
    if (next == null) return;
    setBusy(true);
    setLocalError('');
    const res = await callSetUserEmail(user.id, next);
    if (!res.ok) setLocalError('Fejl: ' + res.error);
    setBusy(false);
  }

  async function handleDelete() {
    if (!window.confirm(
      `Slet ${user.displayName || user.email} PERMANENT?\n\n` +
      'Kontoen fjernes fra login og alle spil. Dette kan ikke fortrydes.',
    )) return;
    setBusy(true);
    setLocalError('');
    try {
      let res = await callDeleteUser(user.id, false);
      // Backend blokerer sletning af brugere med point — spørg og prøv igen med force.
      if (!res.ok && res.code === 'functions/failed-precondition') {
        if (window.confirm(`${res.error}\n\nSlet alligevel?`)) {
          res = await callDeleteUser(user.id, true);
        } else {
          setBusy(false);
          return;
        }
      }
      if (!res.ok) setLocalError('Fejl: ' + res.error);
      // Ved succes forsvinder rækken automatisk (useUsers-listeneren opdaterer).
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '0.5rem',
        alignItems: 'start',
        padding: '0.75rem 0',
        borderBottom: '1px solid var(--c-border)',
      }}
    >
      {/* Info */}
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
        <Avatar uid={user.id} name={user.displayName} emoji={user.avatarEmoji}
          favoriteTeam={user.favoriteTeam} size={40} />
        <div>
          <div style={{ fontWeight: 600 }}>
            {user.displayName || '(ingen navn)'}
            {isOwner && (
              <span
                style={{
                  marginLeft: 6,
                  fontSize: '0.7rem',
                  background: 'var(--c-pitch)',
                  color: '#fff',
                  borderRadius: 4,
                  padding: '1px 5px',
                }}
              >
                EJER
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--c-muted)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>{user.email}</span>
            {badges.map((b) => (
              <span key={b.key} style={{
                fontSize: '0.7rem', background: 'var(--c-border)', color: 'var(--c-text)',
                borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap',
              }}>
                {b.label}
              </span>
            ))}
          </div>
          <div style={{ marginTop: 2, fontSize: '0.82rem' }}>
            <span style={{ color: statusColor[user.status] ?? 'var(--c-muted)' }}>
              {statusLabel[user.status] ?? user.status}
            </span>
            {' · '}
            <span style={{ color: 'var(--c-muted)' }}>
              {roleLabel[user.role] ?? user.role}
            </span>
            {' · '}
            <span style={{ color: 'var(--c-muted)' }}>
              {user.totalPoints ?? 0} point
            </span>
          </div>
          <div style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--c-muted)' }}>
            {!PLATFORM_MODE && (
              <>
                Yndlingshold: {user.favoriteTeam ? prettyTeam(user.favoriteTeam) : '–'}
                {' · '}
              </>
            )}
            Avatar: {user.avatarEmoji
              ? (isJerseyToken(user.avatarEmoji) ? (JERSEY_BY_TOKEN[user.avatarEmoji]?.label ?? 'Trøje') : user.avatarEmoji)
              : '–'}
            {' · '}
            Påmindelser: {user.emailOptOut ? 'Fra' : 'Til'}
          </div>
          {localError && (
            <div style={{ color: 'var(--c-err)', fontSize: '0.8rem', marginTop: 4 }}>
              {localError}
            </div>
          )}
          {resetInfo && (
            <div style={{ color: 'var(--c-ok)', fontSize: '0.8rem', marginTop: 4 }}>
              {resetInfo.sent
                ? `Nulstillingslink sendt til ${resetInfo.email}.`
                : `Link genereret (mail ikke sendt — SMTP mangler).`}
              {resetInfo.link && (
                <div style={{ marginTop: 2 }}>
                  <a href={resetInfo.link} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all', fontSize: '0.72rem' }}>
                    Kopiér/åbn link
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Handlingsknapper. Godkend/afvis/rolle/kodeord vises kun for ikke-ejer-
          rækker; slet-knappen kan også ramme en DUBLET-ejer (bare ikke dig selv),
          så to ejer-konti på samme mail kan ryddes op. */}
      {((!isOwner && (currentUserCanApprove || currentUserIsOwner)) || (currentUserIsOwner && !isSelf)) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          {!isOwner && (currentUserCanApprove || currentUserIsOwner) && (
            <>
          {/* Godkend/afvis — globale admins (og ejer) */}
          {user.status !== USER_STATUS.APPROVED && (
            <button
              className="btn"
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', background: 'var(--c-ok)' }}
              disabled={busy}
              onClick={() => handleStatus(USER_STATUS.APPROVED)}
            >
              Godkend
            </button>
          )}
          {user.status !== USER_STATUS.REJECTED && (
            <button
              className="btn"
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', background: 'var(--c-err)' }}
              disabled={busy}
              onClick={() => handleStatus(USER_STATUS.REJECTED)}
            >
              Afvis
            </button>
          )}

          {/* Udpeg/fjern global admin — kun ejeren */}
          {currentUserIsOwner && (
            <button
              className="btn btn--ghost"
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
              disabled={busy}
              onClick={handleRoleToggle}
            >
              {user.role === ROLES.GLOBAL_ADMIN ? '↓ Til spiller' : '↑ Til global admin'}
            </button>
          )}

          {/* Send nulstillingslink — kun ejeren. Backend findes nu i BEGGE
              codebases (functions + functions-platform), så knappen virker på
              både Tour og platformen (no-op'er pænt uden SMTP_PASSWORD). */}
          {currentUserIsOwner && (
            <button
              className="btn btn--ghost"
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
              disabled={busy}
              onClick={handlePasswordReset}
              title="Send et nulstillingslink via egen SMTP (omgår Firebase-mailen)"
            >
              🔑 Nulstil kodeord
            </button>
          )}
            </>
          )}

          {/* Skift e-mail — kun ejeren, ikke sig selv (egen mail skiftes på
              profilsiden). Ændrer login + påmindelser med det samme. */}
          {currentUserIsOwner && !isSelf && (
            <button
              className="btn btn--ghost"
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
              disabled={busy}
              onClick={handleChangeEmail}
              title="Skift brugerens e-mail (login + påmindelser) med det samme"
            >
              ✏️ Skift e-mail
            </button>
          )}

          {/* Slet bruger permanent — kun ejeren, aldrig sig selv. Rammer også en
              dublet-EJER-konto. Fjerner Auth-kontoen + users/userContacts +
              medlemskaber i alle spil. */}
          {currentUserIsOwner && !isSelf && (
            <button
              className="btn btn--ghost"
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', color: 'var(--c-err)', borderColor: 'var(--c-err)' }}
              disabled={busy}
              onClick={handleDelete}
              title="Sletter kontoen permanent fra login og alle spil"
            >
              🗑️ Slet bruger
            </button>
          )}
        </div>
      )}
    </li>
  );
}
