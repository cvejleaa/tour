// Admin-panel med faner:
//   1. Brugere (globale admins — rolletildeling dog kun for ejer)
//   2. Kampe & resultater (globale admins)
//   3. Bonus-facit (globale admins)
// Rollebaseret adgang håndhæves her og i ProtectedRoute.
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import UsersTab from '../features/admin/UsersTab';
import MatchesTab from '../features/admin/MatchesTab';
import BonusTab from '../features/admin/BonusTab';
import LeaguesAdminTab from '../features/admin/LeaguesAdminTab';
import TestsTab from '../features/admin/TestsTab';
import RunbookTab from '../features/admin/RunbookTab';
import PreviewTab from '../features/admin/PreviewTab';
import EmailLogTab from '../features/admin/EmailLogTab';
import SettingsTab from '../features/admin/SettingsTab';
import AltStandingsTab from '../features/admin/AltStandingsTab';

// Fane-id'er
const TAB_USERS   = 'users';
const TAB_MATCHES = 'matches';
const TAB_BONUS   = 'bonus';
const TAB_LEAGUES = 'leagues';
const TAB_ALT     = 'altstanding';
const TAB_TESTS   = 'tests';
const TAB_RUNBOOK = 'runbook';
const TAB_PREVIEW = 'preview';
const TAB_MAILS   = 'mails';
const TAB_SETTINGS = 'settings';

export default function AdminPage() {
  const { isOwner, isGlobalAdmin } = useAuth();

  // Brugere-fanen er synlig for alle globale admins (godkendelse)
  const [tab, setTab] = useState(TAB_USERS);

  // Faner der er synlige for den aktuelle bruger
  const visibleTabs = [
    // Brugere: alle globale admins (godkend brugere; rolletildeling kun ejer)
    ...(isGlobalAdmin
      ? [{ key: TAB_USERS, label: 'Brugere' }]
      : []),
    { key: TAB_MATCHES, label: 'Kampe & resultater' },
    { key: TAB_BONUS,   label: 'Bonus-facit' },
    { key: TAB_LEAGUES, label: 'Ligaer' },
    { key: TAB_ALT,     label: '🧮 Alt. stilling' },
    { key: TAB_TESTS,   label: 'Tests' },
    { key: TAB_RUNBOOK, label: '📋 Køreplan' },
    { key: TAB_PREVIEW, label: '🔮 Forhåndsvisning' },
    { key: TAB_MAILS,   label: '✉️ Mail-log' },
    // Indstillinger skriver til config (kun ejer kan skrive iflg. reglerne)
    ...(isOwner
      ? [{ key: TAB_SETTINGS, label: '⚙️ Indstillinger' }]
      : []),
  ];

  return (
    <div style={{ paddingTop: '1.5rem' }}>
      {/* Overskrift */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: '0 0 0.25rem', color: 'var(--c-pitch)', fontSize: '1.6rem' }}>
          ⚙️ Admin-panel
        </h1>
        <p style={{ margin: 0, color: 'var(--c-muted)', fontSize: '0.9rem' }}>
          {isOwner
            ? 'Du har fuld adgang som ejer.'
            : 'Du har adgang som global administrator.'}
        </p>
      </div>

      {/* Fane-bjælke */}
      <div
        style={{
          display: 'flex',
          borderBottom: '2px solid var(--c-border)',
          marginBottom: '1.5rem',
          gap: 4,
        }}
      >
        {visibleTabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            data-testid={`tab-${key}`}
            style={{
              padding: '0.6rem 1.2rem',
              background: 'transparent',
              border: 'none',
              borderBottom:
                tab === key
                  ? '3px solid var(--c-pitch)'
                  : '3px solid transparent',
              color: tab === key ? 'var(--c-pitch)' : 'var(--c-muted)',
              fontWeight: tab === key ? 700 : 500,
              cursor: 'pointer',
              fontSize: '0.95rem',
              marginBottom: -2, // dækker border-bottom på containeren
              transition: 'color 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Fane-indhold */}
      <div className="card" style={{ padding: '1.25rem' }}>
        {tab === TAB_USERS   && <UsersTab isOwner={isOwner} isGlobalAdmin={isGlobalAdmin} />}
        {tab === TAB_MATCHES && <MatchesTab />}
        {tab === TAB_BONUS   && <BonusTab />}
        {tab === TAB_LEAGUES && <LeaguesAdminTab />}
        {tab === TAB_ALT     && <AltStandingsTab />}
        {tab === TAB_TESTS   && <TestsTab />}
        {tab === TAB_RUNBOOK && <RunbookTab />}
        {tab === TAB_PREVIEW && <PreviewTab />}
        {tab === TAB_MAILS   && <EmailLogTab />}
        {tab === TAB_SETTINGS && <SettingsTab />}
      </div>
    </div>
  );
}
