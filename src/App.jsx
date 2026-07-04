import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { TasksProvider } from './context/TasksContext';

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
          {/* Liga-invitationslink: virker for både nye, afventende og godkendte brugere */}
          <Route path="/tilmeld" element={<JoinPage />} />
          <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/etaper" element={<ProtectedRoute><StagesPage /></ProtectedRoute>} />
          <Route path="/etape/:number" element={<ProtectedRoute><StagePresentationPage /></ProtectedRoute>} />
          <Route path="/tour" element={<ProtectedRoute><TourPage /></ProtectedRoute>} />
          <Route path="/hold" element={<ProtectedRoute><TeamsPage /></ProtectedRoute>} />
          <Route path="/hold/:code" element={<ProtectedRoute><TeamPage /></ProtectedRoute>} />
          <Route path="/hjaelp" element={<ProtectedRoute><HelpPage /></ProtectedRoute>} />
          <Route path="/mine-tips" element={<ProtectedRoute><MyBetsPage /></ProtectedRoute>} />
          <Route path="/bonus" element={<ProtectedRoute><BonusPage /></ProtectedRoute>} />
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
