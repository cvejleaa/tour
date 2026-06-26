// Beskytter ruter: kræver login, godkendt status og evt. en bestemt rolle.
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, require }) {
  const { user, loading, isApproved, isOwner, isGlobalAdmin } = useAuth();

  if (loading) return <div className="container">Indlæser…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isApproved) return <Navigate to="/afventer" replace />;

  if (require === 'owner' && !isOwner) return <Navigate to="/" replace />;
  if (require === 'admin' && !isGlobalAdmin) return <Navigate to="/" replace />;

  return children;
}
