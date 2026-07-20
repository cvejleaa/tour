import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { TasksProvider } from './context/TasksContext';
import { PLATFORM_MODE } from './lib/platform';

import LoginPage from './pages/LoginPage';
import PendingPage from './pages/PendingPage';
import JoinPage from './pages/JoinPage';
import DashboardPage from './pages/DashboardPage';
import StagesPage from './pages/StagesPage';
import StagePresentationPage from './pages/StagePresentationPage';
import TourPage from './pages/TourPage';
import TeamsPage from './pages/TeamsPage';
import TeamPage from './pages/TeamPage';
import HelpPage from './pages/HelpPage';
import MyBetsPage from './pages/MyBetsPage';
import BonusPage from './pages/BonusPage';
import LeaderboardPage from './pages/LeaderboardPage';
import LeaguesPage from './pages/LeaguesPage';
import GamesPage from './pages/GamesPage';
import GamePage from './pages/GamePage';
import MessagesPage from './pages/MessagesPage';
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/AdminPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  // Tour-spilsiderne er stadig nåbare via URL på den samlede platform. Der
  // hører de til INDE i et spil (Fase B), så i platform-tilstand sendes de
  // videre til spiloversigten i stedet for at vise Tour-indhold.
  const gamePage = (el) => (PLATFORM_MODE ? <Navigate to="/spil" replace /> : el);

  return (
    <TasksProvider>
      <Layout>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/afventer" element={<PendingPage />} />
          {/* Liga-invitationslink: virker for både nye, afventende og godkendte brugere.
              Ligaer hører til inde i et spil (Fase B) — på platformen redirectes det. */}
          <Route path="/tilmeld" element={gamePage(<JoinPage />)} />
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
          <Route path="/hjaelp" element={gamePage(<ProtectedRoute><HelpPage /></ProtectedRoute>)} />
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
      </Layout>
    </TasksProvider>
  );
}
