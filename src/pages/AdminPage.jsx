// Admin-panel med faner:
//   1. Brugere (globale admins — rolletildeling dog kun for ejer)
//   2. Tour (etaperute + resultat-synk, globale admins)
//   3. Bonus-facit (globale admins)
// Rollebaseret adgang håndhæves her og i ProtectedRoute.
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { PLATFORM_MODE } from '../lib/platform';
import UsersTab from '../features/admin/UsersTab';
import TourTab from '../features/admin/TourTab';
import BonusTab from '../features/admin/BonusTab';
import LeaguesAdminTab from '../features/admin/LeaguesAdminTab';
import GameLeagueMembersTab from '../features/admin/GameLeagueMembersTab';
import TestsTab from '../features/admin/TestsTab';
import RunbookTab from '../features/admin/RunbookTab';
import EmailLogTab from '../features/admin/EmailLogTab';
import BroadcastTab from '../features/admin/BroadcastTab';
import SettingsTab from '../features/admin/SettingsTab';
import ActivityTab from '../features/admin/ActivityTab';
import RiderProfilesTab from '../features/admin/RiderProfilesTab';
import TeamStylesTab from '../features/admin/TeamStylesTab';
import GameScheduleTab from '../features/admin/GameScheduleTab';
import GameReminderTab from '../features/admin/GameReminderTab';
import GameRecapBotTab from '../features/admin/GameRecapBotTab';
import DriftTab from '../features/admin/DriftTab';
import ScrollRaekke from '../components/ScrollRaekke';

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
const TAB_ACTIVITY = 'activity';
const TAB_RIDERS = 'riders';
const TAB_TEAMSTYLES = 'teamstyles';
const TAB_SCHEDULE = 'schedule';
const TAB_REMINDERS = 'reminders';
const TAB_RECAPBOT = 'recapbot';
const TAB_LIGAMEDLEM = 'ligamedlem';
const TAB_DRIFT = 'drift';

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
    // Tour-spilspecifikke faner skjules på den samlede platform (Fase B:
    // de flytter ind under det enkelte spils admin).
    ...(PLATFORM_MODE ? [] : [
      { key: TAB_TOUR,    label: '🚴 Tour' },
      { key: TAB_RIDERS,  label: '🏷️ Ryttertyper' },
    ]),
    // Bonus-facit + Ligaer er Tour-spilspecifikke (BonusTab/LeaguesAdminTab);
    // de flytter ind under det enkelte spils admin i Fase B.
    ...(PLATFORM_MODE ? [] : [
      { key: TAB_BONUS,   label: 'Bonus' },
      { key: TAB_LEAGUES, label: 'Ligaer' },
    ]),
    // Samlet platform: spil-tidsplan (start + bonus-deadline) + hold-farver
    // + per-spil påmindelser.
    ...(PLATFORM_MODE ? [
      { key: TAB_SCHEDULE, label: '🗓️ Spil-tidsplan' },
      { key: TAB_TEAMSTYLES, label: '🎨 Hold-farver og navne' },
      { key: TAB_REMINDERS, label: '🔔 Påmindelser' },
      { key: TAB_RECAPBOT, label: '🤖 Runde-Botten' },
      // Navnet er IKKE "👥 Ligaer": den fane findes allerede inde i spillet
      // (GamePage), og samme emoji + næsten samme ord i to navigationer er en
      // forveksling, der venter. Her styres MEDLEMMERNE, ikke ligaerne selv.
      { key: TAB_LIGAMEDLEM, label: '🧑‍🤝‍🧑 Liga-medlemmer' },
    ] : []),
    { key: TAB_TESTS,   label: 'Tests' },
    ...(PLATFORM_MODE ? [] : [{ key: TAB_RUNBOOK, label: '📋 Køreplan' }]),
    // Overvågningsklyngen: "virker det / hvad blev sendt / hvad gjorde folk".
    // Driftstatus kun på platformen — det er dens synk-maskineri, den viser.
    ...(PLATFORM_MODE ? [{ key: TAB_DRIFT, label: '🩺 Driftstatus' }] : []),
    { key: TAB_MAILS,   label: '✉️ Mail-log' },
    { key: TAB_ACTIVITY, label: '📈 Aktivitet' },
    // Send mail (masseudsendelse) + indstillinger — kun ejer.
    // Skjult på den samlede platform indtil videre: begge afhænger af Cloud
    // Functions (sendBroadcastEmail / påmindelser / straf / afslutning), der pt.
    // kun findes i Tour-kodebasen (functions/), ikke i functions-platform. De
    // spil-specifikke indstillinger skal desuden bygges PR. SPIL (spil-vælger).
    // Send mail (broadcast) — ejer, i BEGGE tilstande (backend findes nu på
    // platformen). Indstillinger (recap/straf/afslutning) er stadig Tour-only.
    ...(isOwner ? [{ key: TAB_BROADCAST, label: '📣 Send mail' }] : []),
    ...(isOwner && !PLATFORM_MODE
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

      {/* Fane-bjælke — .tabs-systemet i stedet for den håndrullede kopi:
          rækken havde hverken wrap eller scroll, så på en telefon lå de
          fleste af de 10 faner usynlige uden markering (fanebredde.mjs:
          2/10 synlige ved 390 px). Nu wrap på desktop, scroll + hint på
          mobil — som spillets faner. */}
      <ScrollRaekke className="tabs" role="tablist">
        {visibleTabs.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            data-testid={`tab-${key}`}
            className={tab === key ? 'tab tab--active' : 'tab'}
          >
            {label}
          </button>
        ))}
      </ScrollRaekke>

      {/* Fane-indhold */}
      <div className="card" style={{ padding: '1.25rem' }}>
        {tab === TAB_USERS   && <UsersTab isOwner={isOwner} isGlobalAdmin={isGlobalAdmin} />}
        {tab === TAB_TOUR    && <TourTab />}
        {tab === TAB_RIDERS  && <RiderProfilesTab />}
        {tab === TAB_SCHEDULE && <GameScheduleTab />}
        {tab === TAB_TEAMSTYLES && <TeamStylesTab />}
        {tab === TAB_REMINDERS && <GameReminderTab />}
        {tab === TAB_RECAPBOT && <GameRecapBotTab />}
        {tab === TAB_BONUS   && <BonusTab />}
        {tab === TAB_LEAGUES && <LeaguesAdminTab />}
        {tab === TAB_LIGAMEDLEM && <GameLeagueMembersTab />}
        {tab === TAB_TESTS   && <TestsTab />}
        {tab === TAB_RUNBOOK && <RunbookTab />}
        {tab === TAB_DRIFT   && <DriftTab />}
        {tab === TAB_MAILS   && <EmailLogTab />}
        {tab === TAB_ACTIVITY && <ActivityTab />}
        {tab === TAB_BROADCAST && <BroadcastTab />}
        {tab === TAB_SETTINGS && <SettingsTab />}
      </div>
    </div>
  );
}
