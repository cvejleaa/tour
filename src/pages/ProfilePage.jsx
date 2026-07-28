/**
 * ProfilePage — rediger din profil: avatar-emoji, yndlingshold og e-mail-præferencer.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { updateProfile, updateDisplayName } from '../features/profile/profileActions';
import AccountSection from '../features/profile/AccountSection';
import Avatar from '../components/Avatar';
import EmojiPicker from '../features/comments/EmojiPicker';
import { AVATAR_SET, NEUTRAL_AVATAR_SET } from '../data/avatarSet';
import { isJerseyToken, JERSEY_BY_TOKEN, JerseyIcon } from '../data/jerseyAvatars';
import ThemeToggle from '../features/leaderboard/ThemeToggle';
import TeamThemePicker from '../features/profile/TeamThemePicker';
import { TOUR_TEAMS, prettyTeam } from '../data/tourTeams2026';
import { PLATFORM_MODE } from '../lib/platform';

const teamOptions = [...TOUR_TEAMS].sort((a, b) =>
  prettyTeam(a).localeCompare(prettyTeam(b), 'da'));

export default function ProfilePage() {
  const { user, profile } = useAuth();
  const uid = user?.uid;

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(null);
  const [team, setTeam] = useState('');
  const [optOut, setOptOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Synk fra profil når den loader
  useEffect(() => {
    if (!profile) return;
    setName(profile.displayName ?? '');
    setEmoji(profile.avatarEmoji ?? null);
    setTeam(profile.favoriteTeam ?? '');
    setOptOut(!!profile.emailOptOut);
  }, [profile]);

  async function handleSave(e) {
    e.preventDefault();
    setBusy(true); setMsg(''); setErr('');
    try {
      const cleanName = name.trim();
      if (cleanName && cleanName !== (profile?.displayName ?? '')) {
        await updateDisplayName(uid, cleanName);
      }
      await updateProfile(uid, {
        avatarEmoji: emoji,
        emailOptOut: optOut,
        // Yndlingshold hører til ét spil ad gangen på platformen (vælges under
        // "Mit hold" inde i spillet), så feltet vises ikke her — og må derfor
        // heller ikke sendes med. Ellers ville en gemt profil forsøge at skrive
        // en værdi, brugeren hverken kan se eller ændre.
        ...(PLATFORM_MODE ? {} : { favoriteTeam: team || null }),
      });
      setMsg('Profilen er gemt ✔');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 1rem', fontSize: '1.4rem', fontWeight: 800 }}>👤 Min profil</h1>

      <div className="card" style={{ maxWidth: 520 }}>
        {/* Forhåndsvisning */}
        <div className="flex items-center gap-1 mb-2" style={{ gap: '0.75rem' }}>
          <Avatar uid={uid} name={profile?.displayName} emoji={emoji} favoriteTeam={team || null} size={56} />
          <div>
            <strong style={{ fontSize: '1.05rem' }}>{profile?.displayName || '(uden navn)'}</strong>
            <div style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>{user?.email}</div>
          </div>
        </div>

        <form onSubmit={handleSave}>
          {/* Visningsnavn */}
          <div className="form-group">
            <label className="form-label" htmlFor="display-name">Navn</label>
            <input
              id="display-name"
              className="input"
              type="text"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dit navn"
              style={{ maxWidth: 280 }}
              data-testid="profile-name"
            />
          </div>

          {/* Avatar-emoji */}
          <div className="form-group">
            <label className="form-label">Avatar-emoji</label>
            <div className="flex gap-1" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <EmojiPicker
                onSelect={(e) => setEmoji(e)}
                emojis={PLATFORM_MODE ? NEUTRAL_AVATAR_SET : AVATAR_SET}
                triggerLabel={PLATFORM_MODE ? '😀' : '🚴'}
                label="Vælg avatar"
              />
              <span style={{ fontSize: '1.5rem', display: 'inline-flex', alignItems: 'center' }}>
                {emoji
                  ? (isJerseyToken(emoji)
                    ? <JerseyIcon kind={JERSEY_BY_TOKEN[emoji]?.kind} size={28} title={JERSEY_BY_TOKEN[emoji]?.label} />
                    : emoji)
                  : '—'}
              </span>
              {emoji && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEmoji(null)}>
                  Ryd
                </button>
              )}
              <span style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>
                (uden emoji vises dine initialer)
              </span>
            </div>
          </div>

          {/* Yndlingshold — Tour-hold-specifikt, skjules på den samlede platform */}
          {!PLATFORM_MODE && (
            <div className="form-group">
              <label className="form-label" htmlFor="fav-team">Yndlingshold</label>
              <select
                id="fav-team"
                className="select"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                style={{ maxWidth: 280 }}
              >
                <option value="">– Intet valgt –</option>
                {teamOptions.map((name) => (
                  <option key={name} value={name}>{prettyTeam(name)}</option>
                ))}
              </select>
            </div>
          )}

          {/* E-mail-præferencer */}
          <div className="form-group">
            <label className="form-label">Påmindelser</label>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={!optOut}
                onChange={(e) => setOptOut(!e.target.checked)}
              />
              {PLATFORM_MODE
                ? 'Send mig e-mail-påmindelser om spil jeg mangler at tippe på'
                : 'Send mig e-mail-påmindelser om etaper jeg mangler at tippe på'}
            </label>
          </div>

          {err && <p className="form-error mt-1">{err}</p>}
          {msg && <p className="badge badge--green mt-1" role="status" style={{ display: 'block' }}>{msg}</p>}

          <button className="btn mt-2" type="submit" disabled={busy}>
            {busy ? 'Gemmer…' : 'Gem profil'}
          </button>
        </form>

        {/* Udseende */}
        <div className="form-group mt-2" style={{ borderTop: '1px solid var(--c-border)', paddingTop: '1rem' }}>
          <label className="form-label">Tema</label>
          <div className="flex gap-1" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <ThemeToggle />
            <span style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>
              Skifter mellem lyst og mørkt for hele appen
            </span>
          </div>

          {/* Holdfarve — Tour-hold-tema, skjules på den samlede platform */}
          {!PLATFORM_MODE && (
            <>
              <label className="form-label mt-2" htmlFor="team-theme">Holdfarve</label>
              <TeamThemePicker />
              <span style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>
                Giver appen dit yndlingsholds accentfarve
              </span>
            </>
          )}
        </div>

        {/* Konto & login: skift kontakt-/login-mail og tilkobl Google-login. */}
        <AccountSection user={user} uid={uid} />
      </div>
    </div>
  );
}
