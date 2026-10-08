import React, { useEffect } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CrowdProvider } from './context/CrowdContext';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import CameraFeeds from './pages/CameraFeeds';
import Alerts from './pages/Alerts';
import IncidentLog from './pages/IncidentLog';
import Settings from './pages/Settings';
import ProtectedRoute from './routes/ProtectedRoute';

const AuthRedirect: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    if (user) {
      const from =
        (location.state as { from?: { pathname?: string } } | null)?.from
          ?.pathname ?? '/dashboard';
      navigate(from, { replace: true });
    }
  }, [user, loading, navigate, location]);

  return <Landing />;
};

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<AuthRedirect />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/cameras"
        element={
          <ProtectedRoute>
            <CameraFeeds />
          </ProtectedRoute>
        }
      />
      <Route
        path="/alerts"
        element={
          <ProtectedRoute>
            <Alerts />
          </ProtectedRoute>
        }
      />
      <Route
        path="/incidents"
        element={
          <ProtectedRoute>
            <IncidentLog />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <CrowdProvider>
        <Router>
          <AppRoutes />
        </Router>
      </CrowdProvider>
    </AuthProvider>
  );
};

export default App;
