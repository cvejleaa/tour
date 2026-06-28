// Admin-panel med faner:
//   1. Brugere (globale admins — rolletildeling dog kun for ejer)
//   2. Tour (etaperute + resultat-synk, globale admins)
//   3. Bonus-facit (globale admins)
// Rollebaseret adgang håndhæves her og i ProtectedRoute.
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import UsersTab from '../features/admin/UsersTab';
import TourTab from '../features/admin/TourTab';
import BonusTab from '../features/admin/BonusTab';
import LeaguesAdminTab from '../features/admin/LeaguesAdminTab';
import TestsTab from '../features/admin/TestsTab';
import RunbookTab from '../features/admin/RunbookTab';
import EmailLogTab from '../features/admin/EmailLogTab';
import BroadcastTab from '../features/admin/BroadcastTab';
import SettingsTab from '../features/admin/SettingsTab';

// Fane-id'er
const TAB_USERS   = 'users';
const TAB_TOUR    = 'tour';
const TAB_BONUS   = 'bonus';
const TAB_LEAGUES = 'leagues';
const TAB_TESTS   = 'tests';
const TAB_RUNBOOK = 'runbook';
const TAB_MAILS   = 'mails';
const TAB_BROADCAST = 'broadcast';
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
    { key: TAB_TOUR,    label: '🚴 Tour' },
    { key: TAB_BONUS,   label: 'Bonus' },
    { key: TAB_LEAGUES, label: 'Ligaer' },
    { key: TAB_TESTS,   label: 'Tests' },
    { key: TAB_RUNBOOK, label: '📋 Køreplan' },
    { key: TAB_MAILS,   label: '✉️ Mail-log' },
    // Send mail (masseudsendelse) + indstillinger — kun ejer
    ...(isOwner
      ? [{ key: TAB_BROADCAST, label: '📣 Send mail' },
         { key: TAB_SETTINGS, label: '⚙️ Indstillinger' }]
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
        {tab === TAB_TOUR    && <TourTab />}
        {tab === TAB_BONUS   && <BonusTab />}
        {tab === TAB_LEAGUES && <LeaguesAdminTab />}
        {tab === TAB_TESTS   && <TestsTab />}
        {tab === TAB_RUNBOOK && <RunbookTab />}
        {tab === TAB_MAILS   && <EmailLogTab />}
        {tab === TAB_BROADCAST && <BroadcastTab />}
        {tab === TAB_SETTINGS && <SettingsTab />}
      </div>
    </div>
  );
}
