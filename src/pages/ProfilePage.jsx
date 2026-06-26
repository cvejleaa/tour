/**
 * ProfilePage — rediger din profil: avatar-emoji, yndlingshold og e-mail-præferencer.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { updateProfile } from '../features/profile/profileActions';
import Avatar from '../components/Avatar';
import EmojiPicker from '../features/comments/EmojiPicker';
import { TEAMS, teamName } from '../lib/teams';

const teamOptions = Object.keys(TEAMS).sort((a, b) =>
  teamName(a).localeCompare(teamName(b), 'da'));

export default function ProfilePage() {
  const { user, profile } = useAuth();
  const uid = user?.uid;

  const [emoji, setEmoji] = useState(null);
  const [team, setTeam] = useState('');
  const [optOut, setOptOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Synk fra profil når den loader
  useEffect(() => {
    if (!profile) return;
    setEmoji(profile.avatarEmoji ?? null);
    setTeam(profile.favoriteTeam ?? '');
    setOptOut(!!profile.emailOptOut);
  }, [profile]);

  async function handleSave(e) {
    e.preventDefault();
    setBusy(true); setMsg(''); setErr('');
    try {
      await updateProfile(uid, {
        avatarEmoji: emoji,
        favoriteTeam: team || null,
        emailOptOut: optOut,
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
          {/* Avatar-emoji */}
          <div className="form-group">
            <label className="form-label">Avatar-emoji</label>
            <div className="flex gap-1" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <EmojiPicker onSelect={(e) => setEmoji(e)} />
              <span style={{ fontSize: '1.5rem' }}>{emoji || '—'}</span>
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

          {/* Yndlingshold */}
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
              {teamOptions.map((code) => (
                <option key={code} value={code}>{teamName(code)}</option>
              ))}
            </select>
          </div>

          {/* E-mail-præferencer */}
          <div className="form-group">
            <label className="form-label">Påmindelser</label>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={!optOut}
                onChange={(e) => setOptOut(!e.target.checked)}
              />
              Send mig e-mail-påmindelser om kampe jeg mangler at tippe på
            </label>
          </div>

          {err && <p className="form-error mt-1">{err}</p>}
          {msg && <p className="badge badge--green mt-1" role="status" style={{ display: 'block' }}>{msg}</p>}

          <button className="btn mt-2" type="submit" disabled={busy}>
            {busy ? 'Gemmer…' : 'Gem profil'}
          </button>
        </form>
      </div>
    </div>
  );
}
