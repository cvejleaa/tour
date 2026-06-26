import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { TasksProvider } from './context/TasksContext';

import LoginPage from './pages/LoginPage';
import PendingPage from './pages/PendingPage';
import DashboardPage from './pages/DashboardPage';
import MatchesPage from './pages/MatchesPage';
import HelpPage from './pages/HelpPage';
import TournamentPage from './pages/TournamentPage';
import TeamPage from './pages/TeamPage';
import StatsPage from './pages/StatsPage';
import MyBetsPage from './pages/MyBetsPage';
import BonusPage from './pages/BonusPage';
import LeaderboardPage from './pages/LeaderboardPage';
import LeaguesPage from './pages/LeaguesPage';
import MessagesPage from './pages/MessagesPage';
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/AdminPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <TasksProvider>
      <Layout>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/afventer" element={<PendingPage />} />
          <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/kampe" element={<ProtectedRoute><MatchesPage /></ProtectedRoute>} />
          <Route path="/hjaelp" element={<ProtectedRoute><HelpPage /></ProtectedRoute>} />
          <Route path="/mine-tips" element={<ProtectedRoute><MyBetsPage /></ProtectedRoute>} />
          <Route path="/bonus" element={<ProtectedRoute><BonusPage /></ProtectedRoute>} />
          <Route path="/turnering" element={<ProtectedRoute><TournamentPage /></ProtectedRoute>} />
          <Route path="/hold/:code" element={<ProtectedRoute><TeamPage /></ProtectedRoute>} />
          <Route path="/statistik" element={<ProtectedRoute><StatsPage /></ProtectedRoute>} />
          <Route path="/stilling" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />
          <Route path="/ligaer" element={<ProtectedRoute><LeaguesPage /></ProtectedRoute>} />
          <Route path="/beskeder" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
          <Route path="/profil" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute require="admin"><AdminPage /></ProtectedRoute>} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Layout>
    </TasksProvider>
  );
}
