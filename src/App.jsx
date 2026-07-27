import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { TasksProvider } from './context/TasksContext';
import { PLATFORM_MODE } from './lib/platform';

import LoginPage from './pages/LoginPage';
import PendingPage from './pages/PendingPage';
import JoinPage from './pages/JoinPage';
import HelpPage from './pages/HelpPage';
import GamesPage from './pages/GamesPage';
import GamePage from './pages/GamePage';
import MessagesPage from './pages/MessagesPage';
import ProfilePage from './pages/ProfilePage';
import NotFoundPage from './pages/NotFoundPage';

// Tour-siderne og admin-panelet hentes først når man faktisk går ind på dem.
// Det holder Tour-data (ryttere, ruter, kort) og admin-fanerne ude af den
// bundle, alle henter — især på platformen, hvor Tour-ruterne redirecter.
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const StagesPage = lazy(() => import('./pages/StagesPage'));
const StagePresentationPage = lazy(() => import('./pages/StagePresentationPage'));
const TourPage = lazy(() => import('./pages/TourPage'));
const TeamsPage = lazy(() => import('./pages/TeamsPage'));
const TeamPage = lazy(() => import('./pages/TeamPage'));
const MyBetsPage = lazy(() => import('./pages/MyBetsPage'));
const BonusPage = lazy(() => import('./pages/BonusPage'));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'));
const LeaguesPage = lazy(() => import('./pages/LeaguesPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

export default function App() {
  // Tour-spilsiderne er stadig nåbare via URL på den samlede platform. Der
  // hører de til INDE i et spil (Fase B), så i platform-tilstand sendes de
  // videre til spiloversigten i stedet for at vise Tour-indhold.
  const gamePage = (el) => (PLATFORM_MODE ? <Navigate to="/spil" replace /> : el);

  return (
    <TasksProvider>
      <Layout>
        <Suspense fallback={<div className="spinner" role="status" aria-label="Indlæser" />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/afventer" element={<PendingPage />} />
          {/* Liga-invitationslink: virker for både nye, afventende og godkendte brugere.
              Ligaer hører til inde i et spil (Fase B) — på platformen redirectes det. */}
          {/* Invitationslink virker i begge tilstande — JoinPage er selv
              platform-bevidst (spil-ligaer via ?spil=…&kode=…). */}
          <Route path="/tilmeld" element={<JoinPage />} />
          {/* Platform: forsiden er spiloversigten. Enkelt-spil: Tour-dashboard. */}
          <Route path="/" element={
            PLATFORM_MODE
              ? <Navigate to="/spil" replace />
              : <ProtectedRoute><DashboardPage /></ProtectedRoute>
          } />
          <Route path="/etaper" element={gamePage(<ProtectedRoute><StagesPage /></ProtectedRoute>)} />
          <Route path="/etape/:number" element={gamePage(<ProtectedRoute><StagePresentationPage /></ProtectedRoute>)} />
          <Route path="/tour" element={gamePage(<ProtectedRoute><TourPage /></ProtectedRoute>)} />
          <Route path="/hold" element={gamePage(<ProtectedRoute><TeamsPage /></ProtectedRoute>)} />
          <Route path="/hold/:code" element={gamePage(<ProtectedRoute><TeamPage /></ProtectedRoute>)} />
          {/* Hjælp findes i begge tilstande (indholdet skifter efter PLATFORM_MODE) */}
          <Route path="/hjaelp" element={<ProtectedRoute><HelpPage /></ProtectedRoute>} />
          <Route path="/mine-tips" element={gamePage(<ProtectedRoute><MyBetsPage /></ProtectedRoute>)} />
          <Route path="/bonus" element={gamePage(<ProtectedRoute><BonusPage /></ProtectedRoute>)} />
          <Route path="/stilling" element={gamePage(<ProtectedRoute><LeaderboardPage /></ProtectedRoute>)} />
          <Route path="/ligaer" element={gamePage(<ProtectedRoute><LeaguesPage /></ProtectedRoute>)} />
          <Route path="/spil" element={<ProtectedRoute><GamesPage /></ProtectedRoute>} />
          <Route path="/spil/:gameId" element={<ProtectedRoute><GamePage /></ProtectedRoute>} />
          <Route path="/beskeder" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
          <Route path="/profil" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute require="admin"><AdminPage /></ProtectedRoute>} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
      </Layout>
    </TasksProvider>
  );
}
