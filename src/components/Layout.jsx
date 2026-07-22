// App-skal: top-navigation + indhold. Viser kun relevante links efter rolle.
import { NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useTasks } from '../context/TasksContext';
import { usePendingApprovals } from '../features/admin/usePendingApprovals';
import { useUnreadMessages } from '../features/comments/useUnreadMessages';
import { usePresenceBeacon } from '../features/presence/usePresenceBeacon';
import { PLATFORM_MODE, HOME_PATH } from '../lib/platform';
import Avatar from './Avatar';

// Lille rødt tal-badge (genbruges til godkendelser og beskeder)
function CountBadge({ count, title, testid }) {
  if (!count) return null;
  return (
    <span
      data-testid={testid}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 18, height: 18, padding: '0 5px', borderRadius: 99,
        background: 'var(--c-err)', color: '#fff', fontSize: '0.7rem', fontWeight: 800,
      }}
    >
      {count}
    </span>
  );
}

const linkStyle = ({ isActive }) => ({
  padding: '0.5rem 0.75rem',
  borderRadius: 8,
  textDecoration: 'none',
  color: isActive ? '#fff' : 'var(--c-text)',
  background: isActive ? 'var(--c-pitch)' : 'transparent',
  fontWeight: 600,
});

export default function Layout({ children }) {
  const { user, isApproved, isGlobalAdmin, isOwner, profile } = useAuth();
  const navigate = useNavigate();
  // Antal ventende godkendelser (brugere + ligaer for alle globale admins)
  const { total: pendingCount } = usePendingApprovals({ enabled: isGlobalAdmin, includeUsers: isGlobalAdmin });
  // Ulæste private beskeder (badge på Beskeder)
  const { total: unreadCount } = useUnreadMessages(isApproved ? user?.uid : null);
  // Samlede udestående opgaver (badge på Forside)
  const { total: taskCount } = useTasks();
  // Besøgsstatistik: stempler lastSeenAt/besøg/side pr. navigation (best-effort)
  usePresenceBeacon(isApproved ? user?.uid : null);

  return (
    <div>
      <header style={{ borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface)' }}>
        <nav className="container topnav">
          <span style={{ marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <span aria-hidden>{PLATFORM_MODE ? '🏆' : '🚴'}</span>
            <strong style={{ color: 'var(--c-pitch)' }}>{PLATFORM_MODE ? 'Vejleaa Tip' : 'Tour de France Tip'}</strong>
          </span>
          {user && isApproved && (
            <>
              <NavLink to={HOME_PATH} style={linkStyle} end>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  {PLATFORM_MODE ? 'Spil' : 'Forside'}
                  {!PLATFORM_MODE && (
                    <CountBadge count={taskCount} title={`${taskCount} udestående opgaver`} testid="tasks-count" />
                  )}
                </span>
              </NavLink>
              {/* Spil-specifikke links hører til INDE i et spil (Fase B), ikke i platform-skallen */}
              {!PLATFORM_MODE && (
                <>
                  <NavLink to="/etaper" style={linkStyle}>Etaper</NavLink>
                  <NavLink to="/tour" style={linkStyle}>Tour</NavLink>
                  <NavLink to="/hold" style={linkStyle}>Hold</NavLink>
                  <NavLink to="/mine-tips" style={linkStyle}>Mine tips</NavLink>
                  <NavLink to="/bonus" style={linkStyle}>Bonus</NavLink>
                  <NavLink to="/stilling" style={linkStyle}>Stilling</NavLink>
                  <NavLink to="/ligaer" style={linkStyle}>Ligaer</NavLink>
                  <NavLink to="/hjaelp" style={linkStyle} title="Sådan virker det" aria-label="Hjælp">❓</NavLink>
                </>
              )}
              <NavLink to="/beskeder" style={linkStyle}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  Beskeder
                  <CountBadge count={unreadCount} title={`${unreadCount} ulæste beskeder`} testid="unread-messages-count" />
                </span>
              </NavLink>
              {/* Platform-skallen: hjælpesiden (❓) hører til her, da spil-links bor inde i spillet. */}
              {PLATFORM_MODE && (
                <NavLink to="/hjaelp" style={linkStyle} title="Sådan virker det" aria-label="Hjælp">❓</NavLink>
              )}
              {isGlobalAdmin && (
                <NavLink to="/admin" style={linkStyle}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                    Admin
                    <CountBadge count={pendingCount} title={`${pendingCount} venter på godkendelse`} testid="admin-pending-count" />
                  </span>
                </NavLink>
              )}
            </>
          )}
          {user && isApproved && (
            <NavLink to="/profil" style={linkStyle} title="Min profil"
              aria-label="Min profil">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <Avatar uid={user.uid} name={profile?.displayName} emoji={profile?.avatarEmoji}
                  favoriteTeam={profile?.favoriteTeam} size={26} />
                Min profil
              </span>
            </NavLink>
          )}
          {user ? (
            <button className="btn btn--ghost" onClick={() => signOut(auth).then(() => navigate('/login'))}>
              Log ud{profile?.displayName ? ` (${profile.displayName})` : ''}
            </button>
          ) : (
            <NavLink to="/login" style={linkStyle}>Log ind</NavLink>
          )}
          {isOwner && <span title="Ejer" style={{ fontSize: 12, color: 'var(--c-muted)' }}>ejer</span>}
        </nav>
      </header>
      <main className="container">{children}</main>
    </div>
  );
}
